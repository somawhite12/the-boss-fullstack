import { decodeEventLog } from 'viem';
import type { PublicClient } from 'viem';
import { config } from '../config.js';
import { BossDb } from '../db.js';
import { treasuryAbi } from './abis.js';

export class TreasuryEventScanner {
  private stopped = false;
  constructor(private client: PublicClient, private db: BossDb, private onChange:()=>void) {}
  stop(){ this.stopped = true; }
  async start(){
    while(!this.stopped){
      try{ await this.tick(); }catch(err){ console.error('[treasury-events]', err instanceof Error ? err.message : err); }
      await new Promise(r=>setTimeout(r, config.RPC_POLL_MS));
    }
  }
  async tick(){
    const latest = await this.client.getBlockNumber();
    const saved = this.db.getMeta('treasury_event_block');
    if (!saved) { const start=latest>3000n?latest-3000n:0n; this.db.setMeta('treasury_event_block', start.toString()); return; }
    let from = BigInt(saved) + 1n;
    if (from > latest) return;
    let changed = false;
    const step = BigInt(config.SCAN_CHUNK_BLOCKS);
    while(from <= latest){
      const to = from + step - 1n > latest ? latest : from + step - 1n;
      const logs = await this.client.getLogs({ address:config.TREASURY_ADDRESS, fromBlock:from, toBlock:to });
      for(const log of logs){
        try{
          const decoded = decodeEventLog({ abi:treasuryAbi, data:log.data, topics:log.topics });
          const a:any = decoded.args;
          if(decoded.eventName === 'TradeApplied'){
            this.db.confirmTradeEvent(a.txHash, Number(a.logIndex), Boolean(a.isBuy), a.trader, BigInt(a.quoteAmount), BigInt(a.blockNumber));
            changed = true;
          } else if(decoded.eventName === 'BossDefeated'){
            const prize = BigInt(a.prize);
            this.db.addFeed({
              id:`boss-defeated:${a.roundId}:${log.transactionHash}`,
              type:'boss_defeated',
              message:`FINAL BLOW — ${short(a.winner)} won ${fmtWei(prize)} ETH`,
              trader:a.winner,txHash:log.transactionHash!,blockNumber:log.blockNumber?.toString(),createdAt:Date.now()
            }); changed = true;
          } else if(decoded.eventName === 'BossStarted'){
            this.db.addFeed({ id:`boss-started:${a.roundId}:${log.transactionHash}`, type:'boss_started', message:`BOSS #${a.roundId} entered the arena`, txHash:log.transactionHash!, blockNumber:log.blockNumber?.toString(), createdAt:Date.now() }); changed = true;
          } else if(decoded.eventName === 'PrizeClaimed'){
            this.db.addFeed({ id:`claim:${a.winner}:${log.transactionHash}`, type:'prize_claimed', message:`${short(a.winner)} claimed ${fmtWei(BigInt(a.amount))} ETH`, trader:a.winner, txHash:log.transactionHash!, blockNumber:log.blockNumber?.toString(), createdAt:Date.now() }); changed = true;
          }
        } catch { /* unrelated selector/log */ }
      }
      this.db.setMeta('treasury_event_block', to.toString());
      from = to + 1n;
      if (from <= latest && config.RPC_LOG_PAGE_DELAY_MS > 0) await sleep(config.RPC_LOG_PAGE_DELAY_MS);
    }
    if(changed) this.onChange();
  }
}
function short(a:string){return `${a.slice(0,6)}…${a.slice(-4)}`;}
function fmtWei(v:bigint){ const n=Number(v)/1e18; return n>=1?n.toFixed(3):n.toFixed(5); }

function sleep(ms:number){ return new Promise(r => setTimeout(r, ms)); }
