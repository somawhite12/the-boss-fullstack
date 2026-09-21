import { decodeEventLog } from 'viem';
import type { PublicClient } from 'viem';
import { config } from '../config.js';
import { curveAbi, feeEscrowAbi, feeRouterAbi, treasuryAbi } from '../chain/abis.js';
import type { BossChainContext } from '../chain/context.js';
import { ZERO_BYTES32 } from '../chain/constants.js';

export class FeeKeeper {
  constructor(private client:PublicClient, private wallet:any){}

  async settle(context:BossChainContext){
    const result:string[]=[];
    if(context.phase===0){
      const [fee,tax]=await Promise.all([
        this.client.readContract({address:context.curve,abi:curveAbi,functionName:'quoteFeeBalance'}).catch(()=>0n),
        this.client.readContract({address:context.curve,abi:curveAbi,functionName:'creatorTaxBalance'}).catch(()=>0n),
      ]);
      if(BigInt(fee)+BigInt(tax)>0n){
        await this.send(config.FEE_ROUTER_ADDRESS,feeRouterAbi,'sweepCurveFees',[context.token],'CurveSweepTriggered');
        const [feeAfter,taxAfter]=await Promise.all([
          this.client.readContract({address:context.curve,abi:curveAbi,functionName:'quoteFeeBalance'}),
          this.client.readContract({address:context.curve,abi:curveAbi,functionName:'creatorTaxBalance'}),
        ]);
        if(BigInt(feeAfter)!==0n||BigInt(taxAfter)!==0n)throw new Error('Curve sweep verification failed: pending curve fee balances remain non-zero');
        result.push('curve-sweep');
      }
    } else if(context.phase===2 && context.boundPoolId!==ZERO_BYTES32){
      try{
        await this.send(config.FEE_ROUTER_ADDRESS,feeRouterAbi,'sweepPoolFees',[context.boundPoolId],'PoolSweepTriggered');
        result.push('pool-sweep');
      } catch(err){
        // Pons can legitimately require its trusted fee-sweep operator when a
        // memecoin→ETH conversion is needed. Those fees remain pending and are
        // intentionally NOT counted in currentPot.
        console.warn('[keeper] pool sweep deferred:', err instanceof Error?err.message:err);
      }
    }

    const [escrow, accounting]=await Promise.all([
      this.client.readContract({address:config.PONS_FEE_ESCROW,abi:feeEscrowAbi,functionName:'balanceOf',args:[config.FEE_ROUTER_ADDRESS]}).catch(()=>0n),
      this.client.readContract({address:config.FEE_ROUTER_ADDRESS,abi:feeRouterAbi,functionName:'accounting'}).catch(()=>[0n,0n,0n] as const),
    ]);
    if(BigInt(escrow)>0n || BigInt(accounting[2])>0n){
      await this.send(config.FEE_ROUTER_ADDRESS,feeRouterAbi,'harvest',[]);
      const escrowAfter=await this.client.readContract({address:config.PONS_FEE_ESCROW,abi:feeEscrowAbi,functionName:'balanceOf',args:[config.FEE_ROUTER_ADDRESS]});
      if(BigInt(escrowAfter)!==0n)throw new Error('Harvest verification failed: FeeRouter escrow balance remains non-zero');
      result.push('harvest');
    }
    const [treasuryAccrued,projectAccrued]=await Promise.all([
      this.client.readContract({address:config.FEE_ROUTER_ADDRESS,abi:feeRouterAbi,functionName:'treasuryAccrued'}),
      this.client.readContract({address:config.FEE_ROUTER_ADDRESS,abi:feeRouterAbi,functionName:'projectAccrued'}),
    ]);
    if(BigInt(treasuryAccrued)>0n){
      await this.send(config.FEE_ROUTER_ADDRESS,feeRouterAbi,'releaseTreasury',[],'TreasuryReleased');
      result.push('treasury-release');
    }
    if(BigInt(projectAccrued)>0n){
      try{
        await this.send(config.FEE_ROUTER_ADDRESS,feeRouterAbi,'releaseProject',[],'ProjectReleased');
        result.push('project-release');
      }catch(err){
        // Project payout is intentionally isolated from the prize path. A bad
        // recipient must never block Treasury settlement or final-blow batches.
        console.warn('[keeper] project release deferred:',err instanceof Error?err.message:err);
      }
    }

    // State-level verification after the exact transactions above. This is the
    // value a final-blow batch can actually reserve; pending Pons fees are not.
    const [pot,remainingTreasuryAccrued]=await Promise.all([
      this.client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'currentPot'}),
      this.client.readContract({address:config.FEE_ROUTER_ADDRESS,abi:feeRouterAbi,functionName:'treasuryAccrued'}),
    ]);
    if(BigInt(remainingTreasuryAccrued)!==0n)throw new Error('Treasury release verification failed: treasuryAccrued is non-zero');
    return {steps:result,currentPotWei:BigInt(pot)};
  }

  private async send(address:`0x${string}`,abi:any,functionName:string,args:any[],expectedEvent?:string){
    const account=this.wallet.account!;
    const simulation=await this.client.simulateContract({account,address,abi,functionName: functionName as any,args} as any);
    const hash=await this.wallet.writeContract(simulation.request as any);
    const receipt=await this.client.waitForTransactionReceipt({hash,confirmations:1,timeout:90_000});
    if(receipt.status!=='success')throw new Error(`${functionName} reverted: ${hash}`);
    if(expectedEvent){
      const matched=receipt.logs.some((log:any)=>{
        if(String(log.address).toLowerCase()!==address.toLowerCase())return false;
        try{
          const decoded = decodeEventLog({abi,data:log.data,topics:log.topics}) as { eventName?: string };
          return decoded.eventName===expectedEvent;
        }catch{return false;}
      });
      if(!matched)throw new Error(`${functionName} receipt ${hash} did not contain expected ${expectedEvent} event`);
    }
    console.log(`[keeper] ${functionName} ${hash}`); return hash;
  }
}
