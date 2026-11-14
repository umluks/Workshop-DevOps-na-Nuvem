import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { batchGet, batchPut, TableName } from '../backend/dist/shared/db.js';
import { SHARDS, shardKey, stockForShard } from '../backend/dist/shared/domain.js';
import { summarizeLatency } from '../backend/dist/shared/latency.js';
import type { InventoryShard } from '../backend/shared/types.ts';

function positiveInteger(raw: string | number | undefined, label: string): number {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error(`${label}: informe um inteiro positivo.`);
  return value;
}

async function prepareStock(total: number): Promise<string> {
  const runId = randomUUID();
  const ttl = Math.floor(Date.now() / 1_000) + 7 * 86_400;
  const items: InventoryShard[] = Array.from({ length: SHARDS }, (_, shard) => ({
    ...shardKey(runId, shard),
    remaining: stockForShard(total, shard, SHARDS),
    processed: 0,
    rejected: 0,
    ttl,
  }));
  await batchPut(items);
  return runId;
}

type DistributedPlan = {
  runId: string;
  total: number;
  seconds: number;
  executorCount: number;
  startAt: number;
};

function printPlan(plan: DistributedPlan): void {
  console.log(JSON.stringify({ ...plan, startsAtUtc: new Date(plan.startAt).toISOString() }, null, 2));
}

function readPlan(path: string | undefined): DistributedPlan {
  if (!path) throw new Error('Informe o caminho do plano de execução.');
  const plan: DistributedPlan = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof plan.runId !== 'string' || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(plan.runId)) {
    throw new Error('O plano precisa conter o runId do estoque preparado.');
  }
  positiveInteger(plan.total, 'Total de requisições');
  positiveInteger(plan.seconds, 'Duração');
  positiveInteger(plan.executorCount, 'Número de executores');
  positiveInteger(plan.startAt, 'Horário de início');
  if (plan.executorCount > plan.total) throw new Error('Há mais executores que requisições.');
  return plan;
}

async function main(): Promise<void> {
  const [command, amount, extra, executors, leadTime, ...rest] = process.argv.slice(2);
  if (!command || command === '--help') {
    console.log(
      'Use ./k6-load-test/run.sh --help para ver os comandos.',
    );
    return;
  }
  if (command !== 'worker' && command !== 'plan' && !TableName?.trim())
    throw new Error('Informe TABLE com o nome da tabela DynamoDB do laboratório.');

  if (command === 'plan' || command === 'prepare-distributed') {
    if (rest.length) throw new Error('Argumentos em excesso.');
    const total = positiveInteger(amount ?? 1_000_000, 'Total de requisições');
    const seconds = positiveInteger(extra ?? 60, 'Duração em segundos');
    const executorCount = positiveInteger(executors ?? 8, 'Número de executores');
    const startDelay = positiveInteger(leadTime ?? 300, 'Tempo até o início em segundos');
    if (executorCount > total) throw new Error('Há mais executores que requisições.');
    if (startDelay > 600) throw new Error('Use um tempo até o início de até 600 segundos.');
    const runId = command === 'plan' ? 'simulação' : await prepareStock(total);
    const plan = { runId, total, seconds, executorCount, startAt: Date.now() + startDelay * 1_000 };
    printPlan(plan);
    if (command === 'prepare-distributed') {
      const planPath = fileURLToPath(new URL(`./reports/${runId}/plan.json`, import.meta.url));
      mkdirSync(join(planPath, '..'), { recursive: true });
      writeFileSync(planPath, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' });
      console.log(`Plano para compartilhar com os executores: ${planPath}`);
    }
    return;
  }

  if (command === 'status') {
    if (!amount || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(amount)) {
      throw new Error('Informe o runId gerado na preparação.');
    }
    const keys = Array.from({ length: SHARDS }, (_, shard) => shardKey(amount, shard));
    const items: InventoryShard[] = await batchGet(keys);
    if (!items.length) throw new Error('Estoque da execução não encontrado na tabela.');
    const stockFields = ['processed', 'rejected', 'remaining'] as const;
    const totals = Object.fromEntries(
      stockFields.map((field) => [
        field,
        items.reduce((sum, item) => sum + (item[field] ?? 0), 0),
      ]),
    );
    const orderLatency = summarizeLatency(items.map((item) => item.latencyBuckets ?? {}));
    const stockReport = { runId: amount, shardsFound: items.length, ...totals, orderLatency };
    console.log(JSON.stringify(stockReport, null, 2));
    return;
  }

  const plan = command === 'worker' ? readPlan(amount) : undefined;
  const local = command === 'local';
  const workerNumber = plan ? positiveInteger(extra, 'Número do executor') : 1;
  if (plan && (workerNumber > plan.executorCount || executors))
    throw new Error(`Use um número de executor de 1 a ${plan.executorCount}, sem argumentos adicionais.`);
  if (plan && plan.startAt <= Date.now()) throw new Error('O horário de início já passou.');
  const prepareOnly = command === 'prepare';
  const total = plan?.total ?? positiveInteger(prepareOnly || local ? amount : command, 'Total de requisições');
  if (prepareOnly) {
    console.log(await prepareStock(total));
    return;
  }

  const seconds = plan?.seconds ?? positiveInteger((local ? extra : amount) ?? 60, 'Duração em segundos');
  if (!plan && (local ? executors !== undefined : extra !== undefined))
    throw new Error('Use apenas o total de requisições e a duração em segundos.');
  if (!process.env.API_URL?.trim()) throw new Error('Informe API_URL com a URL base do stage.');
  const apiUrl = new URL(process.env.API_URL);
  if (!['https:', 'http:'].includes(apiUrl.protocol) || apiUrl.search || apiUrl.hash) {
    throw new Error('API_URL deve ser a URL base do stage.');
  }
  if (!process.env.API_KEY?.trim())
    throw new Error('Informe API_KEY com a chave do laboratório.');
  if (!local && process.env.ORDER_TEST_VUS !== undefined) {
    positiveInteger(process.env.ORDER_TEST_VUS, 'ORDER_TEST_VUS');
  }
  let localBinary: string | undefined;
  if (local) {
    if (process.env.ORDER_LOCAL_CONCURRENCY !== undefined) {
      positiveInteger(process.env.ORDER_LOCAL_CONCURRENCY, 'ORDER_LOCAL_CONCURRENCY');
    }
    localBinary = fileURLToPath(new URL('./.bin/orders-local', import.meta.url));
    mkdirSync(join(localBinary, '..'), { recursive: true });
    const source = fileURLToPath(new URL('./orders-local.go', import.meta.url));
    const build = spawnSync('go', ['build', '-o', localBinary, source], { stdio: 'inherit' });
    if (build.error || build.status !== 0)
      throw new Error('Não foi possível compilar o gerador local. Confira se o Go está no PATH.');
  } else {
    const installed = spawnSync('k6', ['version'], { stdio: 'ignore' });
    if (installed.error || installed.status !== 0)
      throw new Error('Instale o k6 e deixe o executável disponível no PATH.');
  }

  const runId = plan?.runId ?? await prepareStock(total);
  const executorCount = plan?.executorCount ?? 1;
  const workerTotal = Math.floor(total / executorCount) + Number(workerNumber <= total % executorCount);
  console.log(JSON.stringify({ runId, workerNumber, workerTotal, seconds, requestsPerSecond: workerTotal / seconds }));
  const reportPath = plan ? `./reports/${runId}/worker-${workerNumber}/` : `./reports/${runId}/`;
  const reportDirectory = fileURLToPath(new URL(reportPath, import.meta.url));
  mkdirSync(reportDirectory, { recursive: true });
  const scenarioPath = fileURLToPath(new URL('./orders.k6.ts', import.meta.url));
  const summaryPath = join(reportDirectory, 'summary.json');
  if (localBinary) {
    const result = spawnSync(localBinary, [], {
      stdio: 'inherit',
      env: {
        ...process.env,
        RUN_ID: runId,
        REQUESTS_TOTAL: String(total),
        DURATION_SECONDS: String(seconds),
        ORDER_SHARDS: String(SHARDS),
        ORDER_LOCAL_REPORT: summaryPath,
      },
    });
    console.log(`Relatório: ${summaryPath}`);
    console.log(`Consultar o estoque: ./k6-load-test/run.sh status ${runId}`);
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
    return;
  }
  const dashboardPath = join(reportDirectory, 'dashboard.html');
  const result = spawnSync('k6', ['run', '--summary-export', summaryPath, scenarioPath], {
    stdio: 'inherit',
    env: {
      ...process.env,
      RUN_ID: runId,
      REQUESTS_TOTAL: String(total),
      DURATION_SECONDS: String(seconds),
      ORDER_EXECUTOR_COUNT: String(executorCount),
      ORDER_EXECUTOR_INDEX: String(workerNumber - 1),
      ORDER_START_AT: String(plan?.startAt ?? 0),
      K6_WEB_DASHBOARD: 'true',
      K6_WEB_DASHBOARD_PORT: '-1',
      K6_WEB_DASHBOARD_EXPORT: dashboardPath,
    },
  });
  console.log(`Relatórios do k6: ${reportDirectory}`);
  console.log(
    `Consultar o estoque: ./k6-load-test/run.sh status ${runId}`,
  );
  if (result.error) throw result.error;
  const summary = existsSync(summaryPath) ? JSON.parse(readFileSync(summaryPath, 'utf8')) : {};
  const requestsSent: number = summary.metrics?.orders_sent?.count ?? 0;
  if (requestsSent !== workerTotal) {
    console.error(`O executor enviou ${requestsSent} de ${workerTotal} pedidos na janela.`);
  }
  process.exitCode = result.status || (requestsSent === workerTotal ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
