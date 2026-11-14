import type {OrderLatency} from './latency.js';

/** Contratos compartilhados pelas três Lambdas. Tempos e durações usam milissegundos, exceto duration (segundos). */
export interface DatabaseKey {
  pk: string;
  sk: string;
}

export type SendMode = 'single' | 'batch';

export interface RunConfig {
  total: number;
  duration: number;
  stock: number;
  workers: number;
  sendMode?: SendMode;
}

export interface RunMetadata extends DatabaseKey, RunConfig {
  createdAt: string;
  startAt?: number;
  ttl: number;
  /** Ausente nos testes antigos, que usavam 64 partições. */
  shards?: number;
  schemaVersion?: number;
}

export interface Order {
  runId: string;
  orderId: string;
  shard: number;
  sentAt?: number;
}

export interface InventoryShard extends DatabaseKey {
  remaining: number;
  processed: number;
  rejected: number;
  ttl: number;
  lastProcessedAt?: number;
  latencyBuckets?: Record<string, number>;
  latencyRecordedThrough?: number;
}

export interface OrderMarker extends DatabaseKey {
  ttl: number;
  /** Marcadores da primeira versão não possuem outcome. */
  outcome?: 'processed' | 'rejected';
}

export interface GeneratorInvocation extends RunConfig {
  runId: string;
  worker: number;
  startAt: number;
  apiUrl: string;
  apiKey: string;
  shards?: number;
}

export interface ErrorSample {
  status: number;
  body: string;
  requestId: string | null;
}

export interface WorkerMetrics extends DatabaseKey {
  ttl: number;
  done: boolean;
  // A primeira gravação do worker contém apenas sua identificação e done=false.
  target?: number;
  sent?: number;
  accepted?: number;
  errors?: number;
  dropped?: number;
  updatedAt?: string;
  latencyMeanMs?: number;
  latencyMaxMs?: number;
  statusCodes?: Record<string, number>;
  errorSamples?: ErrorSample[];
  peakStartedPerSecond?: number;
  httpRequests?: number;
  checkpointError?: string;
  warmupRequests?: number;
  warmupStatus?: number | 'network';
  apiKey?: string;
}

export interface AggregateTotals {
  remaining: number;
  processed: number;
  rejected: number;
  accepted: number;
  errors: number;
  sent: number;
  dropped: number;
  finishedWorkers: number;
}

export type MetricRow = Pick<DatabaseKey, 'sk'> & Partial<AggregateTotals> & {done?: boolean};

export type RunHistoryStatus = 'preparing' | 'sending' | 'processing' | 'completed' | 'completed_with_errors' | 'attention' | 'expired';

/** Resumo persistente: não contém credenciais nem expira junto com os pedidos. */
export interface RunHistorySummary extends DatabaseKey {
  runId: string;
  createdAt: string;
  startAt?: number;
  total: number;
  duration: number;
  workers: number;
  sendMode?: SendMode;
  httpRequests?: number;
  accepted: number | null;
  errors: number | null;
  processed: number | null;
  rejected: number | null;
  dropped: number | null;
  sent: number | null;
  processingMs: number | null;
  orderLatency?: OrderLatency;
  status: RunHistoryStatus;
  complete: boolean;
  cachedAt: string;
  hasSnapshot: boolean;
  note?: string;
}

export interface RunHistoryPage {
  runs: RunHistorySummary[];
  nextCursor: string | null;
}
