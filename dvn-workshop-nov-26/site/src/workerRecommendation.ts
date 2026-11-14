/** Mesmo agrupamento usado pela geradora: cada shard tem seu próprio lote. */
export function estimateBatchRequests(orders: number, shards: number, batchSize: number): number {
  const ordersPerShard = Math.floor(orders / shards);
  const shardsWithExtraOrder = orders % shards;
  return (shards - shardsWithExtraOrder) * Math.ceil(ordersPerShard / batchSize)
    + shardsWithExtraOrder * Math.ceil((ordersPerShard + 1) / batchSize);
}

export const TARGET_HTTP_REQUESTS_PER_WORKER_SECOND = 30;
