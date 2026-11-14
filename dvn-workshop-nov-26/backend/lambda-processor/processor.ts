import { setTimeout as sleep } from 'node:timers/promises';
import type { Context, SQSEvent, SQSBatchResponse } from 'aws-lambda';
import type { TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import {
  db,
  TableName,
  key,
  get,
  batchGet,
  TransactWriteCommand,
  UpdateCommand,
} from '../shared/db.js';
import { order as parseOrder, shardKey } from '../shared/domain.js';
import { errorDetails, errorInfo } from '../shared/errors.js';
import { latencyBucket } from '../shared/latency.js';
import type { DatabaseKey, InventoryShard, Order, OrderMarker } from '../shared/types.js';

// Orçamento de escrita por invocação, em unidades por segundo.
const WRITE_UNITS_PER_SECOND = 96;

function markerKey(currentOrder: Order): DatabaseKey {
  return key(
    `${currentOrder.runId}#ORDER#${currentOrder.orderId}`,
    `ORDER#${currentOrder.orderId}`,
  );
}

async function recordLatency(
  stock: InventoryShard,
  sold: Order[],
  confirmedAt: number,
): Promise<number> {
  const buckets = { ...stock.latencyBuckets };
  let samples = 0;
  for (const { sentAt } of sold) {
    if (
      typeof sentAt !== 'number' ||
      !Number.isSafeInteger(sentAt) ||
      sentAt <= 0 ||
      sentAt > confirmedAt
    )
      continue;
    const upperMs = latencyBucket(confirmedAt - sentAt);
    buckets[upperMs] = (buckets[upperMs] || 0) + 1;
    samples++;
  }
  if (!samples) return 0;

  const through = stock.processed + sold.length;
  try {
    await db.send(
      new UpdateCommand({
        TableName,
        Key: key(stock.pk, stock.sk),
        UpdateExpression:
          'SET latencyBuckets = :buckets, latencyRecordedThrough = :through, lastProcessedAt = :confirmed',
        ConditionExpression:
          '#processed = :through AND (attribute_not_exists(latencyRecordedThrough) OR latencyRecordedThrough < :through)',
        ExpressionAttributeNames: { '#processed': 'processed' },
        ExpressionAttributeValues: {
          ':buckets': buckets,
          ':through': through,
          ':confirmed': confirmedAt,
        },
      }),
      { abortSignal: AbortSignal.timeout(2000) },
    );
  } catch (error) {
    // O currentOrder já foi confirmado. O relatório mostra a cobertura das amostras gravadas.
    if (errorInfo(error).name !== 'ConditionalCheckFailedException') {
      console.warn(
        JSON.stringify({
          event: 'OrderLatencyWriteFailed',
          shardKey: stock.pk,
          ...errorDetails(error),
        }),
      );
    }
  }
  return 1;
}

/** Confirma os marcadores e uma atualização de estoque na mesma transação. */
export async function processBatch(bodies: unknown[]): Promise<void> {
  const processingStartedAt = Date.now();
  const orders = [
    ...new Map(
      bodies.map((body) => {
        const currentOrder = parseOrder(body);
        return [currentOrder.orderId, currentOrder] as const;
      }),
    ).values(),
  ];
  if (!orders.length) return;

  const firstOrder = orders[0];
  if (
    orders.some(
      (currentOrder) =>
        currentOrder.runId !== firstOrder.runId || currentOrder.shard !== firstOrder.shard,
    )
  ) {
    throw new Error('Mixed inventory groups');
  }
  const inventoryKey = shardKey(firstOrder.runId, firstOrder.shard);

  for (let attempt = 0; attempt < 4; attempt++) {
    const [existing, stock] = await Promise.all([
      batchGet<OrderMarker>(orders.map(markerKey)),
      get<InventoryShard>(inventoryKey.pk, inventoryKey.sk),
    ]);

    // Uma reentrega do SQS não pode descontar o mesmo currentOrder duas vezes.
    const existingOrderKeys = new Set(existing.map((marker) => marker.pk));
    const unprocessedOrders = orders.filter(
      (currentOrder) => !existingOrderKeys.has(markerKey(currentOrder).pk),
    );
    if (!unprocessedOrders.length) return;
    if (!stock || !Number.isInteger(stock.remaining) || stock.remaining < 0) {
      throw new Error('Inventory missing or invalid');
    }

    const sold = Math.min(stock.remaining, unprocessedOrders.length);
    const rejected = unprocessedOrders.length - sold;
    const ttl = Math.floor(Date.now() / 1000) + 7 * 86400;
    const transactions: NonNullable<TransactWriteCommandInput['TransactItems']> =
      unprocessedOrders.map((currentOrder, index) => ({
        Put: {
          TableName,
          Item: {
            ...markerKey(currentOrder),
            ttl,
            outcome: index < sold ? 'processed' : 'rejected',
          },
          ConditionExpression: 'attribute_not_exists(pk)',
        },
      }));
    transactions.push({
      Update: {
        TableName,
        Key: inventoryKey,
        UpdateExpression:
          'SET #remaining = #remaining - :sold, #processed = #processed + :sold, #rejected = #rejected + :rejected, #last = :now',
        ConditionExpression: '#remaining = :expected',
        ExpressionAttributeNames: {
          '#remaining': 'remaining',
          '#processed': 'processed',
          '#rejected': 'rejected',
          '#last': 'lastProcessedAt',
        },
        ExpressionAttributeValues: {
          ':sold': sold,
          ':rejected': rejected,
          ':expected': stock.remaining,
          ':now': Date.now(),
        },
      },
    });

    try {
      await db.send(new TransactWriteCommand({ TransactItems: transactions }));
      const telemetryWrites = await recordLatency(
        stock,
        unprocessedOrders.slice(0, sold),
        Date.now(),
      );

      // Cada item transacional consome duas unidades de escrita. A espera mantém
      // o slot ocupado para limitar as consumidoras ao orçamento do banco.
      const minimumProcessingTimeMs =
        ((2 * (unprocessedOrders.length + 1) + telemetryWrites) / WRITE_UNITS_PER_SECOND) * 1000;
      const elapsedMs = Date.now() - processingStartedAt;
      if (elapsedMs < minimumProcessingTimeMs)
        await sleep(Math.ceil(minimumProcessingTimeMs - elapsedMs));
      return;
    } catch (error) {
      // Um conflito exige reler saldo/marcadores. Não é falta de estoque.
      if (errorInfo(error).name !== 'TransactionCanceledException' || attempt === 3)
        throw error;
      await sleep(25 * 2 ** attempt + Math.random() * 25);
    }
  }
}

export const processOrder = (body: unknown): Promise<void> => processBatch([body]);

export async function handler(event: SQSEvent, context?: Context): Promise<SQSBatchResponse> {
  let recordIndex = 0;
  let record = event.Records[0];
  let firstOrder: Order | undefined;
  let operation = 'decodeMessage';
  try {
    while (recordIndex < event.Records.length) {
      firstOrder = undefined;
      operation = 'decodeMessage';
      record = event.Records[recordIndex];
      firstOrder = parseOrder(JSON.parse(record.body));
      const batch: Order[] = [firstOrder];
      let end = recordIndex + 1;
      while (end < event.Records.length) {
        record = event.Records[end];
        const next = parseOrder(JSON.parse(record.body));
        if (next.runId !== firstOrder.runId || next.shard !== firstOrder.shard) break;
        batch.push(next);
        end++;
      }
      record = event.Records[recordIndex];
      operation = 'processInventory';
      await processBatch(batch);
      recordIndex = end;
    }
    return { batchItemFailures: [] };
  } catch (error) {
    const failure = errorInfo(error);
    console.error(
      JSON.stringify({
        event: 'ProcessorBatchFailed',
        operation,
        lambdaRequestId: context?.awsRequestId,
        runId: operation === 'processInventory' ? firstOrder?.runId : undefined,
        shard: operation === 'processInventory' ? firstOrder?.shard : undefined,
        messageId: record?.messageId,
        receiveCount: record?.attributes?.ApproximateReceiveCount,
        ...errorDetails(error),
        cancellationCodes: Array.isArray(failure.CancellationReasons)
          ? failure.CancellationReasons.map((reason) => reason?.Code)
          : undefined,
        failedMessages: event.Records.length - recordIndex,
      }),
    );
    // FIFO: devolve a mensagem com falha e todas as seguintes, mantendo a ordem.
    return {
      batchItemFailures: event.Records.slice(recordIndex).map((record) => ({
        itemIdentifier: record.messageId,
      })),
    };
  }
}
