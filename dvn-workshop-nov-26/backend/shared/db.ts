import {setTimeout as sleep} from 'node:timers/promises';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient, BatchWriteCommand, BatchGetCommand,
  GetCommand, PutCommand, UpdateCommand, QueryCommand, TransactWriteCommand,
  type BatchGetCommandInput, type BatchWriteCommandInput,
  type BatchGetCommandOutput, type BatchWriteCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import type {DatabaseKey} from './types.js';

export const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: {removeUndefinedValues: true},
});
// O SAM injeta TABLE em todas as funções. Não cria conexão nem executa requisição no import.
export const TableName = process.env.TABLE as string;
export {GetCommand, PutCommand, UpdateCommand, QueryCommand, TransactWriteCommand};

export const key = (pk: string, sk: string): DatabaseKey => ({pk, sk});

export async function get<T extends DatabaseKey>(pk: string, sk: string): Promise<T | undefined> {
  const result = await db.send(new GetCommand({TableName, Key: key(pk, sk), ConsistentRead: true}));
  return result.Item as T | undefined;
}

export async function rows<T extends DatabaseKey>(pk: string, prefix: string): Promise<T[]> {
  const items: T[] = [];
  let lastKey: DatabaseKey | undefined;
  do {
    const result = await db.send(new QueryCommand({
      TableName,
      KeyConditionExpression: 'pk = :p AND begins_with(sk, :s)',
      ExpressionAttributeValues: {':p': pk, ':s': prefix},
      ConsistentRead: true,
      ExclusiveStartKey: lastKey,
    }));
    items.push(...(result.Items as T[]));
    lastKey = result.LastEvaluatedKey as DatabaseKey | undefined;
  } while (lastKey);
  return items;
}

/** Processa até quatro lotes em paralelo, respeitando os limites do DynamoDB. */
async function chunks<T, R>(values: T[], size: number, process: (group: T[]) => Promise<R[]>): Promise<R[]> {
  const result: R[] = [];
  for (let offset = 0; offset < values.length; offset += size * 4) {
    const pending: Promise<R[]>[] = [];
    for (let index = offset; index < Math.min(values.length, offset + size * 4); index += size) {
      pending.push(process(values.slice(index, index + size)));
    }
    result.push(...(await Promise.all(pending)).flat());
  }
  return result;
}

const retryDelay = (attempt: number): Promise<void> => sleep(Math.min(1000, 50 * 2 ** attempt) + Math.random() * 50);

async function readBatch<T extends DatabaseKey>(keys: DatabaseKey[]): Promise<T[]> {
  let pending: NonNullable<BatchGetCommandInput['RequestItems']> = {[TableName]: {Keys: keys, ConsistentRead: true}};
  const items: T[] = [];
  for (let attempt = 0; attempt < 8; attempt++) {
    const result: BatchGetCommandOutput = await db.send(new BatchGetCommand({RequestItems: pending}));
    items.push(...((result.Responses?.[TableName] || []) as T[]));
    pending = result.UnprocessedKeys || {};
    if (!Object.keys(pending).length) return items;
    await retryDelay(attempt);
  }
  throw new Error('DynamoDB requests still throttled');
}

async function writeBatch<T extends DatabaseKey>(items: T[]): Promise<never[]> {
  let pending: NonNullable<BatchWriteCommandInput['RequestItems']> = {
    [TableName]: items.map(Item => ({PutRequest: {Item}})),
  };
  for (let attempt = 0; attempt < 8; attempt++) {
    const result: BatchWriteCommandOutput = await db.send(new BatchWriteCommand({RequestItems: pending}));
    pending = result.UnprocessedItems || {};
    if (!Object.keys(pending).length) return [];
    await retryDelay(attempt);
  }
  throw new Error('DynamoDB requests still throttled');
}

export function batchGet<T extends DatabaseKey>(keys: DatabaseKey[]): Promise<T[]> {
  return chunks(keys, 100, group => readBatch<T>(group));
}

export async function batchPut<T extends DatabaseKey>(items: T[]): Promise<void> {
  await chunks(items, 25, writeBatch);
}
