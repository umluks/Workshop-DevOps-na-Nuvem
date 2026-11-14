import {test} from 'node:test';
import assert from 'node:assert/strict';
import {config,order,stockForShard,aggregate,shardKey,SHARDS,nextDeadline} from '../dist/shared/domain.js';
test('estoque distribuído conserva o total inclusive quando não é múltiplo de 64',()=>{for(const n of [0,1,63,64,65,1000000])assert.equal(Array.from({length:SHARDS},(_,i)=>stockForShard(n,i)).reduce((a,b)=>a+b,0),n);});
test('limites de carga e rejeição de valores fracionários',()=>{
 const payload={duration:60,stock:1000,workers:50};
 assert.equal(config({...payload,total:100000}).total,100000);
 for(const total of [-1,0,1.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>config({...payload,total}));
 assert.equal(config({...payload,total:1000000}).total,1000000);
 assert.equal(config({...payload,total:1000001}).total,1000001);
});
test('pedidos inválidos não chegam ao estoque',()=>{assert.throws(()=>order({runId:'x',orderId:'a',shard:0}));assert.throws(()=>order({runId:'a'.repeat(36),orderId:'a',shard:SHARDS}));});
test('separa aceitação HTTP, processamento e rejeição de estoque',()=>{assert.deepEqual(aggregate([{sk:'SHARD#00',remaining:9,processed:1,rejected:2},{sk:'WORKER#0',accepted:3,errors:1,sent:4,dropped:6,done:true},{sk:'ORDER#x',processed:99}]),{remaining:9,processed:1,rejected:2,accepted:3,errors:1,sent:4,dropped:6,finishedWorkers:1});});

test('partições de estoque usam chaves de partição distintas',()=>{assert.equal(new Set(Array.from({length:SHARDS},(_,i)=>shardKey('run',i).pk)).size,SHARDS);});

test('estoque legado de 64 partições preserva o total',()=>{assert.equal(Array.from({length:64},(_,i)=>stockForShard(1000,i,64)).reduce((a,b)=>a+b,0),1000);});

test('atraso do gerador não acumula centenas de slots para enviar em rajada',()=>{
 let next=nextDeadline(0,1000,3);assert.equal(next,1000);
 next=nextDeadline(next,1000,3);assert.equal(next,1003);
 assert.equal(nextDeadline(1003,1004,3),1006);
});
