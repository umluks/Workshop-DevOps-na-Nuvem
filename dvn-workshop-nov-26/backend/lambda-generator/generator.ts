import type { Context } from 'aws-lambda';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { db, TableName, key, PutCommand } from '../shared/db.js';
import { LEGACY_SHARDS, nextDeadline } from '../shared/domain.js';
import { countBatchResults, planBatches } from '../shared/batch.js';
import { errorDetails, errorInfo } from '../shared/errors.js';
import type {
  ErrorSample,
  GeneratorInvocation,
  Order,
  WorkerMetrics,
} from '../shared/types.js';

const maxConcurrentRequests = 128;
const maxRequestsPerSchedulingCycle = 4;
const pacingMarginPerMinuteMs = 1_000;

type WorkerDiagnostic = {
  runId: string;
  worker: number;
  operation: string;
  lambdaRequestId?: string;
};

export async function handler(settings: GeneratorInvocation, context?: Context): Promise<void> {
  const diagnostic: WorkerDiagnostic = {
    runId: settings.runId,
    worker: settings.worker,
    operation: 'initializeWorker',
    lambdaRequestId: context?.awsRequestId,
  };
  try {
    await generateLoad(settings, diagnostic);
  } catch (error) {
    console.error(
      JSON.stringify({ event: 'GeneratorFailed', ...diagnostic, ...errorDetails(error) }),
    );
    throw error;
  }
}

async function generateLoad(
  settings: GeneratorInvocation,
  diagnostic: WorkerDiagnostic,
): Promise<void> {
  const workerKey = key(settings.runId, `WORKER#${settings.worker}`);
  const ttl = Math.floor(Date.now() / 1000) + 7 * 86400;
  try {
    // A mesma invocação assíncrona pode ser entregue novamente pela AWS.
    await db.send(
      new PutCommand({
        TableName,
        Item: { ...workerKey, ttl, done: false },
        ConditionExpression: 'attribute_not_exists(pk)',
      }),
    );
  } catch (error) {
    if (errorInfo(error).name === 'ConditionalCheckFailedException') {
      console.info(
        JSON.stringify({ event: 'GeneratorDuplicateSkipped', ...diagnostic, table: TableName }),
      );
      return;
    }
    throw error;
  }

  diagnostic.operation = 'sendOrders';
  const shards = settings.shards || LEGACY_SHARDS;
  const batch = settings.sendMode === 'batch' ? planBatches(settings, shards) : undefined;
  const target =
    batch?.orders ?? Math.floor((settings.total - 1 - settings.worker) / settings.workers) + 1;
  const requestTarget = batch?.requests ?? target;
  const path = batch ? '/orders/batch' : '/orders';
  console.info(
    JSON.stringify({
      event: 'GeneratorWorkerRegistered',
      ...diagnostic,
      table: TableName,
      path,
      target,
      requestTarget,
      startAt: settings.startAt,
    }),
  );
  let httpRequests = 0;
  let sent = 0;
  let accepted = 0;
  let errors = 0;
  let latencySum = 0;
  let latencyMax = 0;
  const statusCodes: Record<string, number> = {};
  const errorSamples: ErrorSample[] = [];
  const activeRequests = new Set<Promise<void>>();
  let peakStartedPerSecond = 0;
  let currentSendSecond = -1;
  let ordersStartedThisSecond = 0;
  let checkpointError: string | undefined;
  let networkError: ReturnType<typeof errorDetails> | undefined;
  let warmupStatus: number | 'network';

  // Prepara o cliente HTTP durante o intervalo anterior à carga.
  // OPTIONS não cria pedido e é contabilizado separadamente no relatório.
  try {
    const response = await fetch(`${settings.apiUrl}${path}`, {
      method: 'OPTIONS',
      signal: AbortSignal.timeout(3000),
    });
    warmupStatus = response.status;
    await response.arrayBuffer();
    if (!response.ok) {
      console.warn(
        JSON.stringify({
          event: 'GeneratorWarmupFailed',
          ...diagnostic,
          path,
          status: warmupStatus,
        }),
      );
    }
  } catch (error) {
    warmupStatus = 'network';
    console.warn(
      JSON.stringify({
        event: 'GeneratorWarmupFailed',
        ...diagnostic,
        path,
        ...errorDetails(error),
      }),
    );
  }

  async function saveWorkerMetrics(done: boolean): Promise<void> {
    const metrics: WorkerMetrics = {
      ...workerKey,
      ttl,
      target,
      sent,
      accepted,
      errors,
      dropped: done ? target - sent : 0,
      done,
      updatedAt: new Date().toISOString(),
      latencyMeanMs:
        latencySum / (Object.values(statusCodes).reduce((sum, count) => sum + count, 0) || 1),
      latencyMaxMs: latencyMax,
      statusCodes,
      errorSamples,
      peakStartedPerSecond,
      checkpointError,
      warmupRequests: 1,
      warmupStatus,
      httpRequests,
    };
    await db.send(new PutCommand({ TableName, Item: metrics }));
  }

  async function sendOrders(orders: Order[]): Promise<void> {
    const requestStartedAt = performance.now();
    const sentAt = Date.now();
    const ordersWithTimestamp = orders.map((order) => ({ ...order, sentAt }));
    try {
      const response = await fetch(`${settings.apiUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': settings.apiKey },
        body: JSON.stringify(batch ? { orders: ordersWithTimestamp } : ordersWithTimestamp[0]),
        signal: AbortSignal.timeout(10_000),
      });
      const body = await response.text();
      const enqueued = !response.ok
        ? 0
        : batch
          ? countBatchResults(body, orders.length)
          : orders.length;
      if (
        enqueued < orders.length &&
        errorSamples.length < 3 &&
        !errorSamples.some((sample) => sample.status === response.status)
      ) {
        errorSamples.push({
          status: response.status,
          body: body.slice(0, 1500),
          requestId: response.headers.get('x-amzn-requestid'),
        });
      }
      statusCodes[response.status] = (statusCodes[response.status] || 0) + 1;
      if (enqueued > 0 && accepted === 0) {
        console.info(
          JSON.stringify({
            event: 'GeneratorFirstOrdersAccepted',
            ...diagnostic,
            path,
            httpStatus: response.status,
            acceptedOrders: enqueued,
            attemptedOrders: orders.length,
            apiRequestId: response.headers.get('x-amzn-requestid'),
          }),
        );
      }
      accepted += enqueued;
      errors += orders.length - enqueued;
    } catch (error) {
      networkError ??= errorDetails(error);
      errors += orders.length;
      statusCodes.network = (statusCodes.network || 0) + 1;
    } finally {
      const milliseconds = performance.now() - requestStartedAt;
      latencySum += milliseconds;
      latencyMax = Math.max(latencyMax, milliseconds);
    }
  }

  await sleep(Math.max(0, settings.startAt - Date.now()));
  const sendWindowMs = settings.duration * 1000;
  const pacingMarginMs = pacingMarginPerMinuteMs * Math.min(sendWindowMs / 60_000, 1);
  const requestIntervalMs = (sendWindowMs - pacingMarginMs) / Math.max(1, requestTarget);
  const sendWindowEndsAt = settings.startAt + sendWindowMs;
  let nextRequestAt =
    settings.startAt + (settings.worker / settings.workers) * requestIntervalMs;
  let lastCheckpointAt = Date.now();
  let pendingCheckpoint: Promise<void> | undefined;

  while (Date.now() < sendWindowEndsAt && sent < target) {
    let burst = 0;
    while (
      Date.now() >= nextRequestAt &&
      activeRequests.size < maxConcurrentRequests &&
      sent < target &&
      burst < maxRequestsPerSchedulingCycle &&
      Date.now() < sendWindowEndsAt
    ) {
      // Workers recebem sequências intercaladas: 0, 53, 106...; 1, 54, 107...
      const sequence = settings.worker + sent * settings.workers;
      const orders = batch
        ? batch.batches.next().value
        : [{ runId: settings.runId, orderId: `order_${sequence}`, shard: sequence % shards }];
      if (!orders) break;
      sent += orders.length;
      httpRequests++;
      burst++;
      nextRequestAt = nextDeadline(nextRequestAt, Date.now(), requestIntervalMs);
      const second = Math.floor(Date.now() / 1000);
      if (second !== currentSendSecond) {
        currentSendSecond = second;
        ordersStartedThisSecond = 0;
      }
      ordersStartedThisSecond += orders.length;
      peakStartedPerSecond = Math.max(peakStartedPerSecond, ordersStartedThisSecond);
      const request = sendOrders(orders).finally(() => {
        activeRequests.delete(request);
      });
      activeRequests.add(request);
    }

    // A gravação de métricas não bloqueia o envio; só um snapshot fica em voo.
    if (Date.now() - lastCheckpointAt > 2000 && !pendingCheckpoint) {
      lastCheckpointAt = Date.now();
      pendingCheckpoint = saveWorkerMetrics(false)
        .catch((error) => {
          const failure = errorDetails(error);
          if (!checkpointError) {
            console.warn(
              JSON.stringify({ event: 'GeneratorCheckpointFailed', ...diagnostic, ...failure }),
            );
          }
          checkpointError = failure.errorName;
        })
        .finally(() => {
          pendingCheckpoint = undefined;
        });
    }
    await sleep(Math.min(5, Math.max(1, nextRequestAt - Date.now())));
  }

  // Finaliza requisições já iniciadas, sem emitir novos pedidos fora da janela.
  await Promise.all(activeRequests);
  await pendingCheckpoint;
  if (errors > 0 || sent < target) {
    console.warn(
      JSON.stringify({
        event: 'GeneratorSendIncomplete',
        ...diagnostic,
        path,
        target,
        sent,
        accepted,
        errors,
        dropped: target - sent,
        statusCodes,
        networkError,
        samples: errorSamples.map(({ status, requestId }) => ({ status, requestId })),
      }),
    );
  }
  diagnostic.operation = 'writeFinalMetrics';
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await saveWorkerMetrics(true);
      console.info(
        JSON.stringify({
          event: 'GeneratorMetricsSaved',
          ...diagnostic,
          table: TableName,
          path,
          target,
          httpRequests,
          sent,
          accepted,
          errors,
          dropped: target - sent,
          warmupStatus,
        }),
      );
      return;
    } catch (error) {
      if (attempt === 3) throw error;
      await sleep(250 * 2 ** attempt);
    }
  }
}
