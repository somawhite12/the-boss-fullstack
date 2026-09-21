import type { PublicClient } from 'viem';
import { config } from '../config.js';
import { BossDb } from '../db.js';
import { treasuryAbi } from '../chain/abis.js';
import { resolveBossContext } from '../chain/context.js';
import { getPendingRouting, getTransparency, verifyDeployment } from './verify.js';

export class DashboardService {
  private cache:any = null;
  private lastAt = 0;
  private demo = { roundId:1n, hp:2_000_000n, maxHp:2_000_000n, pot:0n, totalTrades:0n, defeated:0n };
  constructor(private client:PublicClient, private db:BossDb){}

  async state(force=false){
    if(config.APP_MODE==='demo') return this.demoState();
    if(!force && this.cache && Date.now()-this.lastAt < 900) return this.cache;
    const [roundId,hp,maxHp,pot,reserved,totalTrades,defeated,paused,migrated,expectedToken,launchToken,bondingCurve,feeRouter,v4PoolId,pending,context] = await Promise.all([
      this.client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'roundId'}),
      this.client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'currentHp'}),
      this.client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'currentBossMaxHp'}),
      this.client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'currentPot'}),
      this.client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'reservedClaims'}),
      this.client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'totalTradesApplied'}),
      this.client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'totalBossesDefeated'}),
      this.client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'reportingPaused'}),
      this.client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'migrated'}),
      this.client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'expectedToken'}),
      this.client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'launchToken'}),
      this.client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'bondingCurve'}),
      this.client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'feeRouter'}),
      this.client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'v4PoolId'}),
      getPendingRouting(this.client), resolveBossContext(this.client)
    ]);
    this.cache = {
      mode:'live', chainId:4663, roundId:roundId.toString(), hp:hp.toString(), maxHp:maxHp.toString(), potWei:pot.toString(),
      reservedClaimsWei:reserved.toString(), totalTrades:totalTrades.toString(), bossesDefeated:defeated.toString(), reportingPaused:paused, migrated,
      expectedToken, launchToken, bondingCurve, feeRouter, v4PoolId,
      lifecycle: !context ? 'pre-arm' : !context.launchExists ? 'armed' : !context.launchBound ? 'launched-unbound' : context.phase===2 ? 'v4' : 'curve',
      computedPoolId:context?.computedPoolId ?? null, phase:context?.phase ?? null,
      pendingRouting:pending, feed:this.db.feed(70), operationsEnabled:config.OPERATIONS_ENABLED,
      token:{name:config.TOKEN_NAME,symbol:config.TOKEN_SYMBOL,logoUri:config.TOKEN_LOGO_URI,description:config.TOKEN_DESCRIPTION},
      updatedAt:Date.now()
    };
    this.lastAt=Date.now(); return this.cache;
  }

  async transparency(){ return { ...(await getTransparency(this.client)), deployment:await verifyDeployment(this.client) }; }
  async claimable(address:`0x${string}`){
    if(config.APP_MODE==='demo') return '0';
    return (await this.client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'claimable',args:[address]})).toString();
  }

  demoTrade(isBuy:boolean, eth:number){
    if(config.APP_MODE!=='demo') throw new Error('Demo controls are disabled outside APP_MODE=demo');
    if(!Number.isFinite(eth)||eth<=0||eth>100) throw new Error('Invalid ETH amount');
    const delta=BigInt(Math.floor(eth*1_000_000));
    const who='0xDEMO00000000000000000000000000000000B055';
    if(isBuy){
      if(delta>=this.demo.hp){
        const defeated=this.demo.roundId; this.demo.defeated++; this.demo.roundId++;
        this.demo.hp=maxHpForRound(this.demo.roundId); this.demo.maxHp=this.demo.hp;
        this.db.addFeed({id:`demo-kill:${Date.now()}`,type:'boss_defeated',message:`FINAL BLOW — demo wallet defeated BOSS #${defeated}`,createdAt:Date.now()});
      } else this.demo.hp-=delta;
    } else this.demo.hp=this.demo.hp+delta>this.demo.maxHp?this.demo.maxHp:this.demo.hp+delta;
    this.demo.totalTrades++;
    this.db.addFeed({id:`demo:${Date.now()}`,type:isBuy?'buy':'sell',message:isBuy?`Demo buy dealt ${eth} ETH of damage`:`Demo sell healed ${eth} ETH`,createdAt:Date.now()});
  }
  private demoState(){ return {mode:'demo',chainId:4663,roundId:this.demo.roundId.toString(),hp:this.demo.hp.toString(),maxHp:this.demo.maxHp.toString(),potWei:this.demo.pot.toString(),reservedClaimsWei:'0',totalTrades:this.demo.totalTrades.toString(),bossesDefeated:this.demo.defeated.toString(),reportingPaused:false,migrated:false,lifecycle:'demo',pendingRouting:{escrowOwedWei:'0',treasuryAccruedWei:'0',projectAccruedWei:'0',routerUnallocatedWei:'0'},feed:this.db.feed(70),operationsEnabled:false,token:{name:config.TOKEN_NAME,symbol:config.TOKEN_SYMBOL,logoUri:config.TOKEN_LOGO_URI,description:config.TOKEN_DESCRIPTION},updatedAt:Date.now()}; }
}
function maxHpForRound(r:bigint){ if(r===1n)return 2_000_000n;if(r===2n)return 5_000_000n;if(r===3n)return 10_000_000n;if(r===4n)return 20_000_000n;if(r===5n)return 35_000_000n;return 50_000_000n; }
