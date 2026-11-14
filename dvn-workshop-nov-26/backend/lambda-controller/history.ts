import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import {
  db,
  TableName,
  key,
  get,
  rows,
  batchGet,
  PutCommand,
  QueryCommand,
} from '../shared/db.js';
import { aggregate, LEGACY_SHARDS, shardKey } from '../shared/domain.js';
import { errorInfo } from '../shared/errors.js';
import { summarizeLatency } from '../shared/latency.js';
import type {
  InventoryShard,
  RunHistoryPage,
  RunHistorySummary,
  RunMetadata,
  WorkerMetrics,
} from '../shared/types.js';

const HISTORY_PARTITION = 'HISTORY';
const PAGE_SIZE = 10;

/** Mesmas métricas para o relatório individual e a tabela, sem contadores globais por pedido. */
export async function loadRunState(metadata: RunMetadata) {
  const runId = metadata.pk;
  const [inventory, workers] = await Promise.all([
    batchGet<InventoryShard>(
      Array.from({ length: metadata.shards || LEGACY_SHARDS }, (_, shard) =>
        shardKey(runId, shard),
      ),
    ),
    rows<WorkerMetrics>(runId, 'WORKER#'),
  ]);
  const totals = aggregate([...inventory, ...workers]);
  const statusCodes: Record<string, number> = {};
  for (const worker of workers) {
    for (const [status, count] of Object.entries(worker.statusCodes || {})) {
      statusCodes[status] = (statusCodes[status] || 0) + count;
    }
  }
  const samples = workers.flatMap((worker) => worker.errorSamples || []);
  const errorSamples = [
    ...new Map(samples.map((sample) => [sample.status + sample.body, sample])).values(),
  ].slice(0, 5);
  const lastProcessedAt = Math.max(0, ...inventory.map((shard) => shard.lastProcessedAt || 0));
  const generationEndedAt = Math.max(
    0,
    ...workers.filter((worker) => worker.done).map((worker) => Date.parse(worker.updatedAt!)),
  );
  const elapsedMs = Math.max(
    0,
    Math.max(lastProcessedAt, generationEndedAt) - Number(metadata.startAt),
  );
  const latencyPending =
    (metadata.schemaVersion || 0) >= 3 &&
    Date.now() - lastProcessedAt < 5_000 &&
    inventory.some((shard) => shard.processed > (shard.latencyRecordedThrough || 0));
  const complete =
    totals.finishedWorkers === metadata.workers &&
    totals.processed + totals.rejected === totals.accepted &&
    !latencyPending;
  const orderLatency = summarizeLatency(
    inventory.flatMap((shard) => (shard.latencyBuckets ? [shard.latencyBuckets] : [])),
  );
  return {
    inventory,
    workers,
    totals,
    statusCodes,
    errorSamples,
    lastProcessedAt,
    elapsedMs,
    complete,
    latencyPending,
    orderLatency,
  };
}

type RunState = Awaited<ReturnType<typeof loadRunState>>;

export function initialHistory(metadata: RunMetadata): RunHistorySummary {
  return {
    ...key(HISTORY_PARTITION, `${metadata.createdAt}#${metadata.pk}`),
    runId: metadata.pk,
    createdAt: metadata.createdAt,
    startAt: metadata.startAt,
    total: metadata.total,
    duration: metadata.duration,
    workers: metadata.workers,
    ...(metadata.sendMode ? { sendMode: metadata.sendMode } : {}),
    accepted: null,
    errors: null,
    processed: null,
    rejected: null,
    dropped: null,
    sent: null,
    processingMs: null,
    status: 'preparing',
    complete: false,
    cachedAt: new Date().toISOString(),
    hasSnapshot: false,
  };
}

export function summarizeRun(
  metadata: RunMetadata,
  state: RunState,
  observedAt = new Date().toISOString(),
): RunHistorySummary {
  const summary = initialHistory(metadata);
  const { totals, complete, lastProcessedAt } = state;
  const startAt = metadata.startAt;
  const now = Date.now();
  const sendingFinished = totals.finishedWorkers === metadata.workers;
  const endOfSending = Number(startAt) + metadata.duration * 1000;
  const detailsExpired =
    metadata.ttl <= Math.floor(now / 1000) &&
    state.inventory.length !== (metadata.shards || LEGACY_SHARDS);

  let status: RunHistorySummary['status'];
  if (detailsExpired) status = 'expired';
  else if (complete)
    status =
      totals.errors || totals.dropped || totals.rejected
        ? 'completed_with_errors'
        : 'completed';
  else if (typeof startAt === 'number' && now < startAt) status = 'preparing';
  else if (!sendingFinished && now <= endOfSending + 30_000) status = 'sending';
  else if (
    state.latencyPending ||
    (sendingFinished &&
      totals.processed + totals.rejected < totals.accepted &&
      now - Math.max(lastProcessedAt, endOfSending) < 90_000)
  )
    status = 'processing';
  else status = 'attention';

  return {
    ...summary,
    ...(metadata.sendMode === 'batch'
      ? {
          httpRequests: state.workers.reduce(
            (sum, worker) => sum + (worker.httpRequests || 0),
            0,
          ),
        }
      : {}),
    accepted: totals.accepted,
    errors: totals.errors,
    processed: detailsExpired ? null : totals.processed,
    rejected: detailsExpired ? null : totals.rejected,
    dropped: totals.dropped,
    sent: totals.sent,
    processingMs:
      typeof startAt === 'number' && lastProcessedAt > 0
        ? Math.max(0, lastProcessedAt - startAt)
        : null,
    ...(!detailsExpired && state.orderLatency ? { orderLatency: state.orderLatency } : {}),
    status,
    complete: complete && !detailsExpired,
    cachedAt: observedAt,
    hasSnapshot: true,
    ...(!startAt
      ? {
          note: 'O início não foi registrado nesta execução antiga; o tempo de processamento não está disponível.',
        }
      : {}),
    ...(detailsExpired
      ? { note: 'Os dados detalhados expiraram. Não há confirmação dos totais finais.' }
      : {}),
  };
}

/** Uma leitura antiga não deve sobrescrever um resumo mais recente ou já finalizado. */
export async function saveHistory(summary: RunHistorySummary): Promise<void> {
  try {
    await db.send(
      new PutCommand({
        TableName,
        Item: summary,
        ConditionExpression: summary.complete
          ? 'attribute_not_exists(cachedAt) OR cachedAt <= :time'
          : '(attribute_not_exists(cachedAt) OR cachedAt <= :time) AND (attribute_not_exists(#complete) OR #complete = :false)',
        ExpressionAttributeNames: summary.complete ? undefined : { '#complete': 'complete' },
        ExpressionAttributeValues: summary.complete
          ? { ':time': summary.cachedAt }
          : { ':time': summary.cachedAt, ':false': false },
      }),
    );
  } catch (error) {
    if (errorInfo(error).name !== 'ConditionalCheckFailedException') throw error;
  }
}

export async function registerHistory(metadata: RunMetadata): Promise<void> {
  try {
    await db.send(
      new PutCommand({
        TableName,
        Item: initialHistory(metadata),
        ConditionExpression: 'attribute_not_exists(pk)',
      }),
    );
  } catch (error) {
    if (errorInfo(error).name !== 'ConditionalCheckFailedException') throw error;
  }
}

async function refreshSummary(cached: RunHistorySummary): Promise<RunHistorySummary> {
  if (cached.complete || cached.status === 'expired') return cached;
  const metadata = await get<RunMetadata>(cached.runId, 'META');
  if (!metadata) {
    const expired: RunHistorySummary = {
      ...cached,
      status: 'expired',
      cachedAt: new Date().toISOString(),
      note: 'Detalhes expirados; os valores disponíveis representam o último registro, não um resultado final confirmado.',
    };
    await saveHistory(expired);
    return expired;
  }
  const observedAt = new Date().toISOString();
  const state = await loadRunState(metadata);
  const summary = summarizeRun(metadata, state, observedAt);
  // Preserva o último saldo observado quando os detalhes já foram removidos pelo TTL.
  if (summary.status === 'expired' && cached.hasSnapshot) {
    summary.processed = cached.processed;
    summary.rejected = cached.rejected;
    summary.processingMs = cached.processingMs;
    summary.orderLatency = cached.orderLatency;
  }
  await saveHistory(summary);
  return summary;
}

export async function listHistory(cursor?: string): Promise<RunHistoryPage> {
  if (cursor && (cursor.length > 128 || !/^\d{4}-\d{2}-\d{2}T.+#[a-f0-9-]{36}$/.test(cursor))) {
    throw new Error('Invalid history cursor');
  }
  const result = await db.send(
    new QueryCommand({
      TableName,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': HISTORY_PARTITION },
      ScanIndexForward: false,
      Limit: PAGE_SIZE,
      ExclusiveStartKey: cursor ? key(HISTORY_PARTITION, cursor) : undefined,
      ConsistentRead: true,
    }),
  );
  const cached = (result.Items || []) as RunHistorySummary[];
  const runs: RunHistorySummary[] = [];
  // Apenas duas execuções ativas são atualizadas em paralelo. As finalizadas usam o resumo salvo.
  for (let index = 0; index < cached.length; index += 2) {
    const refreshed = await Promise.all(
      cached.slice(index, index + 2).map(async (summary) => {
        try {
          return await refreshSummary(summary);
        } catch (error) {
          console.error('History snapshot failed', summary.runId, errorInfo(error));
          return {
            ...summary,
            note: 'Não foi possível atualizar agora; exibindo o último registro disponível.',
          };
        }
      }),
    );
    runs.push(...refreshed);
  }
  return { runs, nextCursor: (result.LastEvaluatedKey?.sk as string) || null };
}

/** Migração manual, idempotente: lê metadados existentes e salva os resumos. Nunca inicia carga. */
export async function backfillHistory(): Promise<number> {
  let lastKey: Record<string, unknown> | undefined;
  const metadata: RunMetadata[] = [];
  do {
    const result = await db.send(
      new ScanCommand({
        TableName,
        FilterExpression: 'sk = :meta',
        ExpressionAttributeValues: { ':meta': 'META' },
        ExclusiveStartKey: lastKey,
      }),
    );
    metadata.push(...((result.Items || []) as RunMetadata[]));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  let imported = 0;
  for (const run of metadata) {
    if (run.ttl <= Math.floor(Date.now() / 1000)) continue;
    await registerHistory(run);
    const cached = await get<RunHistorySummary>(
      HISTORY_PARTITION,
      `${run.createdAt}#${run.pk}`,
    );
    if (cached) await refreshSummary(cached);
    imported++;
  }
  return imported;
}
