import {test} from 'node:test';
import assert from 'node:assert/strict';
import {db,batchGet,batchPut,TableName} from '../dist/shared/db.js';
test('snapshot de 1.024 partições respeita o máximo de 100 chaves por BatchGet',async()=>{
 const sizes=[];db.send=async command=>{const {Keys}=command.input.RequestItems[TableName];sizes.push(Keys.length);return {Responses:{[TableName]:Keys}};};
 const keys=Array.from({length:1024},(_,i)=>({pk:`shard${i}`,sk:'stock'}));
 const rows=await batchGet(keys);assert.equal(rows.length,1024);assert.ok(sizes.every(n=>n<=100));assert.equal(sizes.length,11);
});
test('inicialização usa lotes de até 25 e tenta novamente apenas os itens não processados',async()=>{
 const sizes=[];let first=true;
 db.send=async command=>{const requests=command.input.RequestItems[TableName];sizes.push(requests.length);if(first){first=false;return {UnprocessedItems:{[TableName]:requests.slice(0,1)}};}return {};};
 await batchPut(Array.from({length:64},(_,i)=>({pk:`shard${i}`,sk:'stock'})));
 assert.ok(sizes.every(n=>n<=25));assert.equal(sizes.reduce((a,b)=>a+b,0),65);
});
