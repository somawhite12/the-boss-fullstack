import test from 'node:test';import assert from 'node:assert/strict';import {compareTradePosition} from '../src/shared/types.js';
const x=(b:bigint,t:number,l:number)=>({blockNumber:b,transactionIndex:t,logIndex:l});
test('canonical ordering is block, transaction index, log index',()=>{assert.equal(compareTradePosition(x(2n,0,0),x(1n,99,99)),1);assert.equal(compareTradePosition(x(2n,2,0),x(2n,1,999)),1);assert.equal(compareTradePosition(x(2n,2,3),x(2n,2,4)),-1);});
