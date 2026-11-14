import http from 'k6/http';
import exec from 'k6/execution';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { SHARDS } from '../backend/dist/shared/domain.js';
import type { Order } from '../backend/shared/types.ts';

const apiUrl = __ENV.API_URL?.replace(/\/+$/, '');
const apiKey = __ENV.API_KEY;
const runId = __ENV.RUN_ID ?? '';
const total = Number(__ENV.REQUESTS_TOTAL ?? Number(__ENV.REQUESTS_K) * 1_000);
const seconds = Number(__ENV.DURATION_SECONDS ?? 60);
const requestWindowMs = seconds * 1_000;
const schedulingMarginMs = Math.min(200, requestWindowMs * 0.01);
const schedulingWindowMs = requestWindowMs - schedulingMarginMs;
const executorCount = Number(__ENV.ORDER_EXECUTOR_COUNT ?? 1);
const executorIndex = Number(__ENV.ORDER_EXECUTOR_INDEX ?? 0);
const startAt = Number(__ENV.ORDER_START_AT ?? 0);
const distributed = startAt > 0;
const localTotal = Math.floor(total / executorCount) + Number(executorIndex < total % executorCount);
const estimatedIterationSeconds = distributed ? 2 : 0.48;
const estimatedVus = Math.ceil((localTotal / seconds) * estimatedIterationSeconds);
const vus = Number(__ENV.ORDER_TEST_VUS ?? Math.min(localTotal, estimatedVus));
const warmupConnectionsPerSecond = 60;
const warmupSeconds = Math.ceil(vus / warmupConnectionsPerSecond) + 12;

if (!apiUrl || !apiKey || !runId) throw new Error('Informe API_URL, API_KEY e RUN_ID.');
for (const value of [total, seconds, vus, executorCount]) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error('Volume, duração e VUs devem ser inteiros positivos.');
  }
}
if (!Number.isSafeInteger(executorIndex) || executorIndex < 0 || executorIndex >= executorCount) {
  throw new Error('Número do executor inválido.');
}

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  setupTimeout: '15m',
  scenarios: distributed ? {
    orders: {
      executor: 'constant-arrival-rate',
      rate: localTotal,
      // Reserve uma margem dentro da janela para a transição do setup ao cenário.
      timeUnit: `${schedulingWindowMs}ms`,
      duration: `${schedulingWindowMs}ms`,
      preAllocatedVUs: vus,
      gracefulStop: '15s',
    },
  } : {
    warmup: {
      executor: 'per-vu-iterations',
      exec: 'warmUpConnection',
      vus,
      iterations: 1,
      maxDuration: `${warmupSeconds}s`,
      gracefulStop: '0s',
    },
    orders: {
      executor: 'shared-iterations',
      startTime: `${warmupSeconds}s`,
      vus,
      iterations: total,
      maxDuration: `${seconds}s`,
    },
  },
  thresholds: { 'dropped_iterations{scenario:orders}': ['count==0'] },
};

export function setup(): void {
  if (!distributed) return;
  const waitSeconds = (startAt - Date.now()) / 1_000;
  if (waitSeconds <= 0) throw new Error('O horário de início já passou. Prepare uma nova execução.');
  sleep(waitSeconds);
}

const sent = new Counter('orders_sent');
const accepted = new Counter('orders_accepted');
const throttled = new Counter('orders_throttled');
const throttledBySqs = new Counter('orders_throttled_sqs');
const throttledByGateway = new Counter('orders_throttled_gateway');
const failed = new Counter('orders_failed');
const orderHttpLatency = new Trend('orders_http_duration', true);
const request = {
  headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
  timeout: '10s',
  redirects: 0,
};

export function warmUpConnection(): void {
  sleep((exec.vu.idInTest - 1) / warmupConnectionsPerSecond);
  http.options(`${apiUrl}/orders`, null, {
    ...request,
    responseType: 'none',
  });
}

export default function sendOrder(): void {
  const sequence = exec.scenario.iterationInTest;
  if (sequence >= localTotal || (distributed && Date.now() >= startAt + requestWindowMs)) return;
  if (!distributed) {
    const scheduledAt = exec.scenario.startTime + (sequence * schedulingWindowMs) / total;
    const waitSeconds = (scheduledAt - Date.now()) / 1_000;
    if (waitSeconds > 0) sleep(waitSeconds);
    if (Date.now() >= exec.scenario.startTime + requestWindowMs) return;
  }
  const orderNumber = sequence * executorCount + executorIndex;
  const order: Order = {
    runId,
    orderId: `order_${orderNumber}`,
    shard: orderNumber % SHARDS,
    sentAt: Date.now(),
  };
  const response = http.post(`${apiUrl}/orders`, JSON.stringify(order), request);
  sent.add(1);
  orderHttpLatency.add(response.timings.duration);
  // A integração gerenciada retorna 202. A montagem manual também pode retornar 200.
  const enqueued = check(response, {
    'pedido aceito pela API': ({ status }) => status === 202 || status === 200,
  });
  accepted.add(Number(enqueued));
  throttled.add(Number(response.status === 429));
  failed.add(Number(!enqueued));
  if (response.status === 429) {
    const errorBody = typeof response.body === 'string' ? response.body : '';
    const errorType = response.headers['X-Amzn-Errortype'] ?? '';
    throttledBySqs.add(Number(errorBody.includes('RequestThrottled')));
    throttledByGateway.add(
      Number(/TooManyRequestsException|LimitExceededException/i.test(errorType)),
    );
  }
}
