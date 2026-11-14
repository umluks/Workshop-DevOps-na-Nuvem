import type {GeneratorInvocation, Order} from './types.js';

export const BATCH_SIZE = 10;

/** Cada shard pertence a um worker. Todos os pedidos de um lote compartilham o grupo FIFO. */
export function planBatches(settings: GeneratorInvocation, shards: number, batchSize = BATCH_SIZE) {
  const groups: Array<{shard: number; count: number}> = [];
  for (let shard = settings.worker; shard < Math.min(shards, settings.total); shard += settings.workers) {
    groups.push({
      shard,
      count: Math.floor((settings.total - 1 - shard) / shards) + 1,
    });
  }

  function* batches(): Generator<Order[]> {
    let activeGroups = groups;
    for (let offset = 0; activeGroups.length; offset += batchSize) {
      activeGroups = activeGroups.filter(group => group.count > offset);
      for (const {shard, count} of activeGroups) {
        yield Array.from({length: Math.min(count - offset, batchSize)}, (_, index) => ({
          runId: settings.runId,
          orderId: `order_${shard + (offset + index) * shards}`,
          shard,
        }));
      }
    }
  }

  return {
    orders: groups.reduce((sum, group) => sum + group.count, 0),
    requests: groups.reduce((sum, group) => sum + Math.ceil(group.count / batchSize), 0),
    batches: batches(),
  };
}

/** O SQS pode devolver HTTP 200 com falhas em parte das entradas. */
export function countBatchResults(body: string, size: number): number {
  const result = JSON.parse(body) as {Successful?: Array<{Id?: unknown}>};
  const accepted = new Set((result.Successful || []).map(item => item.Id));
  return Array.from({length: size}, (_, index) => accepted.has(String(index)))
    .filter(Boolean).length;
}
