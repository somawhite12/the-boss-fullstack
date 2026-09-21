import { recoverAddress } from 'viem';
import type { PublicClient } from 'viem';
import { config } from '../config.js';
import { BossDb } from '../db.js';
import type { CanonicalTrade, ChainCursor, Hex, JsonTrade } from '../shared/types.js';
import { compareTradePosition, tradeToJson } from '../shared/types.js';
import { treasuryAbi } from '../chain/abis.js';
import { resolveBossContext } from '../chain/context.js';
import { ZERO_ADDRESS, ZERO_BYTES32 } from '../chain/constants.js';
import { makeRelayer } from '../chain/client.js';
import { FeeKeeper } from './keeper.js';

export class OperationsCoordinator {
  private stopped=false;
  private busy=false;
  private wallet:any;
  private account:any;
  private keeper?:FeeKeeper;
  constructor(private client:PublicClient,private db:BossDb,private onChange:()=>void){
    if(config.OPERATIONS_ENABLED){
      const r=makeRelayer(); this.wallet=r.walletClient; this.account=r.account; this.keeper=new FeeKeeper(client,this.wallet as any);
    }
  }
  stop(){this.stopped=true;}
  async start(){
    if(!config.OPERATIONS_ENABLED){ console.log('[ops] disabled — read-only website/backend mode'); return; }
    console.log(`[ops] enabled with relayer ${this.account.address}`);
    while(!this.stopped){
      try{await this.tick();}catch(err){console.error('[ops]',err instanceof Error?err.stack||err.message:err);}
      await sleep(Math.max(1000,config.RPC_POLL_MS));
    }
  }

  async tick(){
    if(this.busy)return; this.busy=true;
    try{
      let context=await resolveBossContext(this.client);
      if(!context?.launchExists)return;
      if(!context.launchBound){
        await this.sendTreasury('bindLaunch',[]);
        context=await resolveBossContext(this.client); if(!context?.launchBound)return;
      }
      if(context.phase===2 && context.boundPoolId===ZERO_BYTES32){
        await this.sendTreasury('bindV4Pool',[context.computedPoolId]);
        context=await resolveBossContext(this.client); if(!context)return;
      }

      const latest=await this.client.getBlockNumber();
      if(latest<BigInt(config.REPORTER_CONFIRMATIONS))return;
      const safe=latest-BigInt(config.REPORTER_CONFIRMATIONS);
      const [lb,lti,lli,hp,round]=await Promise.all([
        this.client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'lastBlockNumber'}),
        this.client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'lastTransactionIndex'}),
        this.client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'lastLogIndex'}),
        this.client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'currentHp'}),
        this.client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'roundId'}),
      ]);
      const cursor:ChainCursor={blockNumber:BigInt(lb),transactionIndex:Number(lti),logIndex:Number(lli)};
      this.db.markThroughCursorConfirmed(cursor.blockNumber,cursor.transactionIndex,cursor.logIndex);
      let pending=this.db.pendingTradesThroughBlock(safe,config.MAX_BATCH_SIZE).filter(t=>compareTradePosition(t,cursor)>0);
      if(!pending.length)return;
      if(!config.V4_REPORTING_ENABLED && pending.some(t=>t.venue===1)){
        console.warn('[ops] V4 trade is pending but V4_REPORTING_ENABLED=false. Holding batch until fixture validation is completed.');
        return;
      }

      // Keep one Boss kill as a hard batch boundary. Trades after the final blow
      // belong to the next round and are submitted in the next batch.
      const killBatch=wouldKillInBatch(pending,BigInt(hp),BigInt(round));
      pending=truncateAtFirstKill(pending,BigInt(hp),BigInt(round));

      // Settlement always happens before a batch, and therefore necessarily
      // before any potential final blow in that batch.
      const settlement=await this.keeper!.settle(context);
      if(killBatch) console.log(`[ops] final-blow batch settlement verified; currentPot=${settlement.currentPotWei} wei; steps=${settlement.steps.join(',')||'none'}`);

      const deadline=BigInt(Math.floor(Date.now()/1000)+config.BATCH_DEADLINE_SECONDS);
      const digest=await this.client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'batchDigest',args:[toContractTrades(pending),deadline]}) as Hex;
      const signatures=await this.collectSignatures(pending,deadline,digest);
      if(signatures.length<2)throw new Error('Could not collect two valid reporter signatures');

      const simulation=await this.client.simulateContract({account:this.account,address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'submitTradeBatch',args:[toContractTrades(pending),deadline,signatures]});
      const txHash=await this.wallet.writeContract(simulation.request);
      const receipt=await this.client.waitForTransactionReceipt({hash:txHash,confirmations:1,timeout:90_000});
      if(receipt.status!=='success')throw new Error(`submitTradeBatch failed ${txHash}`);
      this.db.markConfirmed(pending); this.db.recordBatch(pending[0],pending[pending.length-1],pending.length,'confirmed',txHash);
      console.log(`[ops] batch ${txHash} (${pending.length} trades)`); this.onChange();
    } finally {this.busy=false;}
  }

  private async collectSignatures(trades:CanonicalTrade[],deadline:bigint,digest:Hex){
    const body=JSON.stringify({trades:trades.map(t=>tradeToJson(t)),deadline:deadline.toString()});
    const valid=new Map<string,Hex>();
    await Promise.all(config.REPORTER_SIGNER_URLS.map(async url=>{
      try{
        const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),config.REPORTER_SIGNER_TIMEOUT_MS);
        const headers:Record<string,string>={'content-type':'application/json'};
        if(config.REPORTER_SIGNER_AUTH_TOKEN)headers.authorization=`Bearer ${config.REPORTER_SIGNER_AUTH_TOKEN}`;
        const res=await fetch(`${url.replace(/\/$/,'')}/sign`,{method:'POST',headers,body,signal:controller.signal}); clearTimeout(timer);
        if(!res.ok)throw new Error(`${res.status} ${await res.text()}`);
        const data:any=await res.json(); const sig=data.signature as Hex;
        const recovered=await recoverAddress({hash:digest,signature:sig});
        const active=await this.client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'isReporter',args:[recovered]});
        if(!active)throw new Error(`signature recovered non-reporter ${recovered}`);
        valid.set(recovered.toLowerCase(),sig);
      }catch(err){console.warn(`[ops] signer ${url} rejected:`,err instanceof Error?err.message:err);}
    }));
    return [...valid.values()].slice(0,3);
  }

  private async sendTreasury(functionName:'bindLaunch'|'bindV4Pool',args:any[]){
    const simulation=await this.client.simulateContract({account:this.account,address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName,args} as any);
    const hash=await this.wallet.writeContract(simulation.request); const r=await this.client.waitForTransactionReceipt({hash,confirmations:1,timeout:90_000});
    if(r.status!=='success')throw new Error(`${functionName} reverted ${hash}`); console.log(`[ops] ${functionName} ${hash}`);
  }
}


export function wouldKillInBatch(trades:CanonicalTrade[],startingHp:bigint,startingRound:bigint){
  let hp=startingHp,round=startingRound;
  for(const t of trades){
    const delta=t.quoteAmount*1_000_000n/1_000_000_000_000_000_000n;
    if(t.isBuy){if(hp>0n&&delta>=hp)return true;hp=delta>=hp?0n:hp-delta;}
    else {const max=maxHpForRound(round);hp=hp+delta>max?max:hp+delta;}
  }
  return false;
}
export function maxHpForRound(round:bigint){if(round===1n)return 2_000_000n;if(round===2n)return 5_000_000n;if(round===3n)return 10_000_000n;if(round===4n)return 20_000_000n;if(round===5n)return 35_000_000n;return 50_000_000n;}
export function truncateAtFirstKill(trades:CanonicalTrade[],startingHp:bigint,startingRound:bigint){
  let hp=startingHp,round=startingRound;
  const out:CanonicalTrade[]=[];
  for(const t of trades){
    out.push(t); const delta=t.quoteAmount*1_000_000n/1_000_000_000_000_000_000n;
    if(t.isBuy){ if(hp>0n&&delta>=hp)return out; hp=delta>=hp?0n:hp-delta; }
    else {const max=maxHpForRound(round); hp=hp+delta>max?max:hp+delta;}
  }
  return out;
}
function toContractTrades(ts:CanonicalTrade[]){return ts.map(t=>({blockNumber:t.blockNumber,transactionIndex:t.transactionIndex,logIndex:t.logIndex,txHash:t.txHash,trader:t.trader,quoteAmount:t.quoteAmount,venue:t.venue,sourceId:t.sourceId,isBuy:t.isBuy}));}
function sleep(ms:number){return new Promise(r=>setTimeout(r,ms));}
