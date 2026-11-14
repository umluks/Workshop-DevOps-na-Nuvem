import {test} from 'node:test';
import assert from 'node:assert/strict';
import {db} from '../dist/shared/db.js';
import {handler} from '../dist/lambda-generator/generator.js';
test('gerador v2 envia a partição correta e preserva amostra do erro sem persistir a chave',async()=>{
 const original=globalThis.fetch,stored=[];let calls=0;
 db.send=async command=>{stored.push(command.input.Item);return {};};
 globalThis.fetch=async(url,options)=>{
  if(options.method==='OPTIONS')return new Response('{}',{status:200});
  calls++;assert.equal(url,'https://example.test/orders');
  assert.equal(options.headers['x-api-key'],'test-secret');
  const body=JSON.parse(options.body);assert.equal(body.shard,99);assert.equal(body.orderId,'order_99');
  return new Response(JSON.stringify({source:'SQS',code:'RequestThrottled'}),{status:429,headers:{'x-amzn-requestid':'diagnostic-id'}});
 };
 try{
  await handler({runId:'run',worker:99,workers:100,total:100,duration:1,startAt:Date.now(),apiUrl:'https://example.test',apiKey:'test-secret',shards:1024});
  assert.equal(calls,1);const final=stored.at(-1);
  assert.equal(final.warmupRequests,1);assert.equal(final.warmupStatus,200);assert.equal(final.errors,1);assert.equal(final.accepted,0);assert.equal(final.dropped,0);assert.equal(final.done,true);
  assert.equal(final.errorSamples[0].status,429);assert.match(final.errorSamples[0].body,/RequestThrottled/);
  assert.equal(final.errorSamples[0].requestId,'diagnostic-id');assert.ok(!JSON.stringify(stored).includes('test-secret'));
 }finally{globalThis.fetch=original;}
});

test('gerador em lote conta rejeição individual mesmo com resposta HTTP 200', async () => {
  const originalFetch = globalThis.fetch;
  const originalSend = db.send;
  const stored = [];
  const batches = [];
  db.send = async command => { stored.push(command.input.Item); return {}; };
  globalThis.fetch = async (url, options) => {
    if (options.method === 'OPTIONS') return new Response('{}', {status: 200});
    batches.push({url, orders: JSON.parse(options.body).orders});
    return Response.json({
      Successful: Array.from({length: 9}, (_, index) => ({Id: String(index)})),
      Failed: [{Id: '9', Code: 'RequestThrottled'}],
    });
  };

  try {
    await handler({
      runId: 'run', worker: 0, workers: 1, total: 10, duration: 1,
      startAt: Date.now(), apiUrl: 'https://example.test', apiKey: 'test-secret',
      shards: 1, sendMode: 'batch',
    });
    assert.equal(batches.length, 1);
    assert.equal(batches[0].url, 'https://example.test/orders/batch');
    assert.equal(batches[0].orders.length, 10);
    assert.ok(batches[0].orders.every(item => item.shard === 0));
    const final = stored.at(-1);
    assert.equal(final.httpRequests, 1);
    assert.equal(final.sent, 10);
    assert.equal(final.accepted, 9);
    assert.equal(final.errors, 1);
    assert.equal(final.dropped, 0);
    assert.deepEqual(final.statusCodes, {'200': 1});
    assert.match(final.errorSamples[0].body, /RequestThrottled/);
  } finally {
    globalThis.fetch = originalFetch;
    db.send = originalSend;
  }
});
