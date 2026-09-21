import test from 'node:test';import assert from 'node:assert/strict';import {maxHpForRound,truncateAtFirstKill,wouldKillInBatch} from '../src/ops/coordinator.js';import type {CanonicalTrade} from '../src/shared/types.js';
const base={blockNumber:100n,transactionIndex:0,logIndex:0,txHash:`0x${'11'.repeat(32)}` as const,trader:'0x1111111111111111111111111111111111111111' as const,venue:0 as const,sourceId:`0x${'00'.repeat(12)}2222222222222222222222222222222222222222` as const};
function t(i:number,eth:number,isBuy=true):CanonicalTrade{return{...base,logIndex:i,txHash:(`0x${String(i+1).padStart(2,'0').repeat(32)}`) as `0x${string}`,quoteAmount:BigInt(Math.round(eth*1e6))*10n**12n,isBuy};}
test('HP schedule is frozen',()=>{assert.equal(maxHpForRound(1n),2_000_000n);assert.equal(maxHpForRound(2n),5_000_000n);assert.equal(maxHpForRound(5n),35_000_000n);assert.equal(maxHpForRound(6n),50_000_000n);assert.equal(maxHpForRound(99n),50_000_000n);});
test('batch stops exactly at first final blow',()=>{const xs=[t(0,.5),t(1,.4,false),t(2,2.0),t(3,.1)];const out=truncateAtFirstKill(xs,2_000_000n,1n);assert.equal(out.length,3);assert.equal(out[2].logIndex,2);});
test('sell healing is capped during kill simulation',()=>{const xs=[t(0,5,false),t(1,2.1)];const out=truncateAtFirstKill(xs,1_000_000n,1n);assert.equal(out.length,2);});

test('kill detection matches batch truncation',()=>{const xs=[t(0,.2),t(1,1.9)];assert.equal(wouldKillInBatch(xs,2_000_000n,1n),true);assert.equal(truncateAtFirstKill(xs,2_000_000n,1n).length,2);});
