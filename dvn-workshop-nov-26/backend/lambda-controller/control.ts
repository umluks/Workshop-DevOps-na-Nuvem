import { randomUUID } from 'node:crypto';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { SQSClient, GetQueueAttributesCommand } from '@aws-sdk/client-sqs';
import { db, TableName, key, get, batchPut, PutCommand } from '../shared/db.js';
import { config, SHARDS, stockForShard, shardKey } from '../shared/domain.js';
import { errorDetails, errorInfo } from '../shared/errors.js';
import {
  listHistory,
  loadRunState,
  registerHistory,
  saveHistory,
  summarizeRun,
} from './history.js';
import type {
  GeneratorInvocation,
  InventoryShard,
  RunConfig,
  RunMetadata,
} from '../shared/types.js';

const lambdaClient = new LambdaClient({});
const sqsClient = new SQSClient({});

function response(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}

const startDelayMs = 10_000;

type RunDiagnostic = { operation: string; runId?: string };

async function startLoadTest(
  event: APIGatewayProxyEvent,
  diagnostic: RunDiagnostic,
): Promise<APIGatewayProxyResult> {
  let settings: RunConfig;
  try {
    settings = config(JSON.parse(event.body || '{}'));
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: 'RunValidationFailed',
        apiRequestId: event.requestContext?.requestId,
        errorName: errorInfo(error).name,
      }),
    );
    return response(400, { message: errorInfo(error).message });
  }

  // A execução guarda sua própria divisão para que alterações futuras não mudem o estoque anterior.
  const shards = SHARDS;
  const runId = randomUUID();
  diagnostic.runId = runId;
  const createdAt = new Date().toISOString();
  const ttl = Math.floor(Date.now() / 1000) + 7 * 86400;
  const metadata: RunMetadata = {
    ...key(runId, 'META'),
    ...settings,
    createdAt,
    ttl,
    startAt: Date.now() + startDelayMs,
    shards,
    schemaVersion: 3,
  };
  diagnostic.operation = 'writeRunMetadata';
  await db.send(new PutCommand({ TableName, Item: metadata }));
  diagnostic.operation = 'registerHistory';
  await registerHistory(metadata);

  // O estoque é criado antes de liberar qualquer gerador.
  const inventory: InventoryShard[] = Array.from({ length: shards }, (_, shard) => ({
    ...shardKey(runId, shard),
    remaining: stockForShard(settings.stock, shard, shards),
    processed: 0,
    rejected: 0,
    ttl,
  }));
  diagnostic.operation = 'initializeInventory';
  await batchPut(inventory);

  const startAt = Date.now() + startDelayMs;
  diagnostic.operation = 'updateStartTime';
  metadata.startAt = startAt;
  await db.send(new PutCommand({ TableName, Item: metadata }));
  console.info(
    JSON.stringify({
      event: 'RunInventoryInitialized',
      runId,
      apiRequestId: event.requestContext?.requestId,
      table: TableName,
      shards,
      stock: settings.stock,
      total: settings.total,
      startAt,
    }),
  );

  diagnostic.operation = 'invokeGenerator';
  // Event solicita invocações assíncronas independentes; não espera a carga terminar.
  const generatorLaunches = await Promise.allSettled(
    Array.from({ length: settings.workers }, (_, worker) => {
      const invocation: GeneratorInvocation = {
        ...settings,
        shards,
        runId,
        worker,
        startAt,
        apiUrl: `https://${event.requestContext.domainName}/${event.requestContext.stage}`,
        apiKey: event.headers['x-api-key'] ?? event.headers['X-Api-Key'] ?? '',
      };
      return lambdaClient.send(
        new InvokeCommand({
          FunctionName: process.env.GENERATOR,
          InvocationType: 'Event',
          Payload: Buffer.from(JSON.stringify(invocation)),
        }),
      );
    }),
  );

  const failures = generatorLaunches.flatMap((result, worker) =>
    result.status === 'rejected' ? [{ worker, reason: result.reason }] : [],
  );
  if (failures.length > 0) {
    console.error(
      JSON.stringify({
        event: 'GeneratorLaunchFailed',
        runId,
        apiRequestId: event.requestContext?.requestId,
        generator: process.env.GENERATOR,
        requested: settings.workers,
        failed: failures.length,
        acceptedInvocations: generatorLaunches.length - failures.length,
        samples: failures
          .slice(0, 5)
          .map(({ worker, reason }) => ({ worker, ...errorDetails(reason) })),
      }),
    );
  } else {
    console.info(
      JSON.stringify({
        event: 'GeneratorInvocationsAccepted',
        runId,
        apiRequestId: event.requestContext?.requestId,
        generator: process.env.GENERATOR,
        acceptedInvocations: generatorLaunches.length,
      }),
    );
  }

  return response(201, {
    runId,
    ...settings,
    createdAt,
    startAt,
    launchErrors: failures.length,
  });
}

async function readLoadTest(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const runId = event.pathParameters?.runId;
  if (!runId) return response(400, { message: 'runId obrigatório' });

  const metadata = await get<RunMetadata>(runId, 'META');
  if (!metadata) return response(404, { message: 'Execução não encontrada' });

  const observedAt = new Date().toISOString();
  const [state, queue, deadLetters] = await Promise.all([
    loadRunState(metadata),
    sqsClient.send(
      new GetQueueAttributesCommand({
        QueueUrl: process.env.QUEUE,
        AttributeNames: [
          'ApproximateNumberOfMessages',
          'ApproximateNumberOfMessagesNotVisible',
        ],
      }),
    ),
    sqsClient.send(
      new GetQueueAttributesCommand({
        QueueUrl: process.env.DLQ,
        AttributeNames: ['ApproximateNumberOfMessages'],
      }),
    ),
  ]);
  const { totals, workers, statusCodes, errorSamples, lastProcessedAt, elapsedMs, complete } =
    state;
  const summary = summarizeRun(metadata, state, observedAt);
  await saveHistory(summary);
  console.info(
    JSON.stringify({
      event: 'RunReportRead',
      runId,
      apiRequestId: event.requestContext?.requestId,
      table: TableName,
      status: summary.status,
      workersFinished: totals.finishedWorkers,
      accepted: totals.accepted,
      processed: totals.processed,
      rejected: totals.rejected,
      queueAvailable: Number(queue.Attributes?.ApproximateNumberOfMessages ?? 0),
      queueInFlight: Number(queue.Attributes?.ApproximateNumberOfMessagesNotVisible ?? 0),
      deadLetters: Number(deadLetters.Attributes?.ApproximateNumberOfMessages ?? 0),
    }),
  );

  return response(200, {
    runId,
    ...metadata,
    ...totals,
    statusCodes,
    errorSamples,
    lastProcessedAt,
    elapsedMs,
    ...(metadata.sendMode === 'batch'
      ? { httpRequests: workers.reduce((sum, worker) => sum + (worker.httpRequests || 0), 0) }
      : {}),
    complete,
    status: summary.status,
    orderLatency: summary.orderLatency,
    queue: Number(queue.Attributes?.ApproximateNumberOfMessages),
    inflight: Number(queue.Attributes?.ApproximateNumberOfMessagesNotVisible),
    dlq: Number(deadLetters.Attributes?.ApproximateNumberOfMessages),
    workers: metadata.workers,
    workerDetails: workers.map(({ apiKey: _secret, ...metrics }) => metrics),
  });
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const diagnostic: RunDiagnostic = {
    operation:
      event.httpMethod === 'POST'
        ? 'startRun'
        : event.pathParameters?.runId
          ? 'readRun'
          : 'listHistory',
    runId: event.pathParameters?.runId,
  };
  try {
    if (event.httpMethod === 'POST') return await startLoadTest(event, diagnostic);
    if (!event.pathParameters?.runId) {
      const cursor = event.queryStringParameters?.cursor;
      try {
        const history = await listHistory(cursor);
        console.info(
          JSON.stringify({
            event: 'RunHistoryRead',
            apiRequestId: event.requestContext?.requestId,
            table: TableName,
            runs: history.runs.length,
            hasNextPage: history.nextCursor !== null,
          }),
        );
        return response(200, history);
      } catch (error) {
        if (errorInfo(error).message === 'Invalid history cursor')
          return response(400, { message: 'Cursor de histórico inválido' });
        throw error;
      }
    }
    return await readLoadTest(event);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'ControllerRequestFailed',
        ...diagnostic,
        apiRequestId: event.requestContext?.requestId,
        method: event.httpMethod,
        resource: event.resource,
        ...errorDetails(error),
      }),
    );
    return response(500, {
      message: 'Falha ao consultar ou iniciar a execução. Consulte os logs.',
    });
  }
}
