import type {AggregateTotals, DatabaseKey, MetricRow, Order, RunConfig} from './types.js';

export const SHARDS = 1024;
export const LEGACY_SHARDS = 64;
export const MAX_WORKERS = 100;

/** Valida os limites antes de criar estoque ou iniciar geradores. */
export function config(body: unknown): RunConfig {
  const value = body as Record<string, unknown>;
  const total = value?.total;
  if (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 1) {
    throw new Error('total: informe um inteiro positivo representável com exatidão');
  }
  const limits: ReadonlyArray<readonly [keyof RunConfig, number, number]> = [
    ['duration', 1, 600],
    ['stock', 0, 10_000_000],
    ['workers', 1, MAX_WORKERS],
  ];

  for (const [field, minimum, maximum] of limits) {
    const number = value?.[field];
    if (typeof number !== 'number' || !Number.isInteger(number) || number < minimum || number > maximum) {
      throw new Error(`${field}: inteiro entre ${minimum} e ${maximum}`);
    }
  }
  if (value.sendMode !== undefined && value.sendMode !== 'single' && value.sendMode !== 'batch') {
    throw new Error('sendMode: use single ou batch');
  }
  return {
    total,
    duration: value.duration as number,
    stock: value.stock as number,
    workers: value.workers as number,
    ...(value.sendMode ? {sendMode: value.sendMode} : {}),
  };
}

/** Distribui também o resto da divisão, preservando a soma exata do estoque. */
export function stockForShard(stock: number, shard: number, shards = SHARDS): number {
  return Math.floor(stock / shards) + (shard < stock % shards ? 1 : 0);
}

export function order(body: unknown): Order {
  const value = body as Partial<Order>;
  if (
    typeof value?.runId !== 'string' || !/^[a-f0-9-]{36}$/.test(value.runId) ||
    typeof value.orderId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value.orderId) ||
    typeof value.shard !== 'number' || !Number.isInteger(value.shard) || value.shard < 0 || value.shard >= SHARDS
  ) {
    throw new Error('Pedido inválido');
  }
  return value as Order;
}

export function aggregate(items: MetricRow[]): AggregateTotals {
  const sum = (field: Exclude<keyof AggregateTotals, 'finishedWorkers'>, prefix: string): number =>
    items.filter(item => item.sk.startsWith(prefix)).reduce((total, item) => total + (item[field] || 0), 0);

  return {
    remaining: sum('remaining', 'SHARD#'),
    processed: sum('processed', 'SHARD#'),
    rejected: sum('rejected', 'SHARD#'),
    accepted: sum('accepted', 'WORKER#'),
    errors: sum('errors', 'WORKER#'),
    sent: sum('sent', 'WORKER#'),
    dropped: sum('dropped', 'WORKER#'),
    finishedWorkers: items.filter(item => item.sk.startsWith('WORKER#') && item.done).length,
  };
}

export function shardKey(runId: string, shard: number): DatabaseKey {
  return {pk: `${runId}#SHARD#${shard}`, sk: `SHARD#${String(shard).padStart(2, '0')}`};
}

/** Um atraso pode liberar o slot atual, mas não acumula centenas de slots vencidos. */
export function nextDeadline(previous: number, now: number, interval: number): number {
  return Math.max(previous + interval, now);
}
