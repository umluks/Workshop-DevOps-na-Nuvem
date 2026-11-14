import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {db} from '../dist/shared/db.js';
import {processBatch,processOrder,handler} from '../dist/lambda-processor/processor.js';
import {shardKey} from '../dist/shared/domain.js';
import {summarizeLatency} from '../dist/shared/latency.js';
const runId='12345678-1234-1234-1234-123456789012';
const order=(n,shard=0)=>({runId,orderId:`order_${n}`,shard});
const id=k=>`${k.pk}|${k.sk}`;
let items,transactions,hook;
const seed=(remaining,shard=0)=>{const k=shardKey(runId,shard);items.set(id(k),{...k,remaining,processed:0,rejected:0});};
const stock=(shard=0)=>items.get(id(shardKey(runId,shard)));
beforeEach(()=>{
 items=new Map();transactions=[];hook=null;
 db.send=async command=>{
  const c=command.input,name=command.constructor.name;
  if(name==='GetCommand')return {Item:structuredClone(items.get(id(c.Key)))};
  if(name==='BatchGetCommand')return {Responses:Object.fromEntries(Object.entries(c.RequestItems).map(([table,{Keys}])=>[table,Keys.map(k=>items.get(id(k))).filter(Boolean).map(x=>structuredClone(x))]))};
  if(name==='UpdateCommand'){
   const current=items.get(id(c.Key)), values=c.ExpressionAttributeValues;
   assert.equal(current.processed,values[':through']);
   current.latencyBuckets=values[':buckets'];
   current.latencyRecordedThrough=values[':through'];
   current.lastProcessedAt=values[':confirmed'];
   return {};
  }
  assert.equal(name,'TransactWriteCommand');
  if(hook)await hook(c);
  const ops=c.TransactItems,update=ops.at(-1).Update,current=items.get(id(update.Key)),v=update.ExpressionAttributeValues;
  if(ops.slice(0,-1).some(op=>items.has(id(op.Put.Item)))||current.remaining!==v[':expected'])throw Object.assign(new Error('conditional conflict'),{name:'TransactionCanceledException'});
  for(const op of ops.slice(0,-1)){assert.equal(op.Put.ConditionExpression,'attribute_not_exists(pk)');items.set(id(op.Put.Item),structuredClone(op.Put.Item));}
  current.remaining-=v[':sold'];current.processed+=v[':sold'];current.rejected+=v[':rejected'];
  assert.ok(current.remaining>=0);transactions.push(c);return {};
 };
});
test('dez pedidos atualizam o estoque uma vez, atomicamente com dez marcadores',async()=>{
 seed(20);await processBatch(Array.from({length:10},(_,i)=>order(i)));
 assert.equal(transactions.length,1);assert.equal(transactions[0].TransactItems.length,11);
 assert.equal(stock().remaining,10);assert.equal(stock().processed,10);
 assert.equal(transactions[0].TransactItems.at(-1).Update.ExpressionAttributeNames['#processed'],'processed');
});
test('lote com saldo parcial vende apenas o saldo e rejeita os demais, na ordem',async()=>{
 seed(3);await processBatch(Array.from({length:5},(_,i)=>order(i)));
 assert.equal(stock().remaining,0);assert.equal(stock().processed,3);assert.equal(stock().rejected,2);
 const outcomes=[...items.values()].filter(x=>x.outcome).map(x=>x.outcome);
 assert.deepEqual(outcomes,['processed','processed','processed','rejected','rejected']);
});
test('reentrega de um lote inteiro não altera estoque nem contadores',async()=>{
 seed(5);const batch=[order(0),order(1)];await processBatch(batch);await processBatch(batch);
 assert.equal(transactions.length,1);assert.equal(stock().remaining,3);assert.equal(stock().processed,2);
});
test('latência inclui a confirmação da transação e conta cada venda uma vez',async()=>{
 seed(1);
 const sentAt=Date.now()-100;
 let writtenAt=0;
 hook=async()=>{writtenAt=Date.now();};
 const batch=[{...order(0),sentAt},{...order(1),sentAt}];
 await processBatch(batch);
 await processBatch(batch);
 assert.equal(stock().processed,1);
 assert.equal(stock().rejected,1);
 assert(stock().lastProcessedAt>=writtenAt);
 const latency=summarizeLatency([stock().latencyBuckets]);
 assert.equal(latency.samples,1);
 assert(latency.p95Ms>=writtenAt-sentAt);
 assert.equal(latency.p99Ms,latency.p95Ms);
});
test('lote misturando duplicados e pedidos novos processa somente os novos',async()=>{
 seed(5);await processOrder(order(0));await processBatch([order(0),order(1),order(1)]);
 assert.equal(stock().remaining,3);assert.equal(stock().processed,2);
});
test('conflito obriga releitura do saldo antes de decidir vendas e rejeições',async()=>{
 seed(3);let conflict=true;hook=async()=>{if(conflict){stock().remaining=1;stock().processed=2;conflict=false;}};
 await processBatch([order(0),order(1)]);
 assert.equal(stock().remaining,0);assert.equal(stock().processed,3);assert.equal(stock().rejected,1);
});
test('falha de infraestrutura retorna mensagens FIFO pendentes sem virar falta de estoque',async()=>{
 seed(3);hook=async()=>{throw Object.assign(new Error('capacity exceeded'),{name:'ThrottlingException'});};
 const result=await handler({Records:[0,1].map(i=>({messageId:String(i),body:JSON.stringify(order(i))}))});
 assert.deepEqual(result.batchItemFailures,[{itemIdentifier:'0'},{itemIdentifier:'1'}]);
 assert.equal(stock().remaining,3);assert.equal(stock().rejected,0);assert.equal(transactions.length,0);
});
test('falha no segundo grupo não devolve o primeiro grupo já confirmado',async()=>{
 seed(3,0);seed(3,1);hook=async c=>{if(c.TransactItems.at(-1).Update.Key.pk.endsWith('#1'))throw new Error('failed');};
 const result=await handler({Records:[0,1].map(i=>({messageId:String(i),body:JSON.stringify(order(i,i))}))});
 assert.deepEqual(result.batchItemFailures,[{itemIdentifier:'1'}]);assert.equal(stock(0).remaining,2);assert.equal(stock(1).remaining,3);
});
test('estoque ausente é falha de processamento, nunca rejeição de negócio',async()=>{await assert.rejects(processOrder(order(0)),/Inventory missing/);assert.equal(transactions.length,0);});
