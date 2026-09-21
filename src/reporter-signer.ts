import express from 'express';
import { privateKeyToAccount } from 'viem/accounts';
import { getAddress } from 'viem';
import { config } from './config.js';
import { makePublicClient } from './chain/client.js';
import { treasuryAbi } from './chain/abis.js';
import { resolveBossContext } from './chain/context.js';
import { discoverLaunchBlock } from './chain/launch.js';
import { reconstructCanonicalTradesChunked, sameTrade } from './chain/trades.js';
import type { CanonicalTrade, ChainCursor, JsonTrade } from './shared/types.js';
import { jsonToTrade } from './shared/types.js';

if(!/^0x[0-9a-fA-F]{64}$/.test(config.REPORTER_PRIVATE_KEY))throw new Error('REPORTER_PRIVATE_KEY is required for signer service');
if(!config.SIGNER_RPC_URL)throw new Error('SIGNER_RPC_URL is required — use an independent provider for each production signer');
if(!config.TRADER_ADAPTER_VERIFIED)throw new Error('TRADER_ADAPTER_VERIFIED=true is required before a reporter signer may attest trades');
if(config.SIGNER_HOST !== '127.0.0.1' && config.SIGNER_HOST !== 'localhost' && !config.REPORTER_SIGNER_AUTH_TOKEN){
  throw new Error('A non-local SIGNER_HOST requires REPORTER_SIGNER_AUTH_TOKEN');
}
const account=privateKeyToAccount(config.REPORTER_PRIVATE_KEY as `0x${string}`);
const client=makePublicClient(config.SIGNER_RPC_URL);
const app=express(); app.use(express.json({limit:'128kb'}));

function authorize(req:express.Request,res:express.Response,next:express.NextFunction){
  const expected=config.REPORTER_SIGNER_AUTH_TOKEN;
  if(!expected)return next();
  const got=req.headers.authorization;
  if(got!==`Bearer ${expected}`)return res.status(401).json({error:'unauthorized'});
  next();
}

app.get('/health',async(_req,res)=>{
  const reporter=await client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'isReporter',args:[account.address]});
  res.json({ok:true,address:account.address,activeReporter:reporter,traderAdapterVerified:config.TRADER_ADAPTER_VERIFIED,v4ReportingEnabled:config.V4_REPORTING_ENABLED});
});

app.post('/sign',authorize,async(req,res)=>{
  try{
    const trades=(req.body?.trades as JsonTrade[]|undefined)?.map(jsonToTrade)??[];
    const deadline=BigInt(req.body?.deadline??0);
    if(!trades.length||trades.length>64)throw new Error('Invalid trade count');
    if(!config.V4_REPORTING_ENABLED && trades.some(t=>t.venue===1))throw new Error('V4 reporting is safety-gated until real Pons V4 fixture validation is complete');
    const now=BigInt(Math.floor(Date.now()/1000));
    if(deadline<=now||deadline>now+BigInt(config.SIGNER_MAX_DEADLINE_SECONDS))throw new Error('Unsafe deadline');
    const isReporter=await client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'isReporter',args:[account.address]});
    if(!isReporter)throw new Error(`${account.address} is not an active reporter`);
    const context=await resolveBossContext(client); if(!context?.launchBound)throw new Error('Launch is not bound in Treasury');

    const [lastBlock,lastTx,lastLog,latest]=await Promise.all([
      client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'lastBlockNumber'}),
      client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'lastTransactionIndex'}),
      client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'lastLogIndex'}),
      client.getBlockNumber(),
    ]);
    const cursor:ChainCursor={blockNumber:BigInt(lastBlock),transactionIndex:Number(lastTx),logIndex:Number(lastLog)};
    const last=trades[trades.length-1];
    if(latest<last.blockNumber+BigInt(config.REPORTER_CONFIRMATIONS))throw new Error('Last trade is not sufficiently confirmed');

    // Critical safety property: independently reconstruct every canonical Pons
    // trade after the on-chain cursor through the proposed last log. A fresh
    // signer starts at TokenLaunched rather than block zero; all reads are
    // chunked so normal RPC range limits cannot silently weaken this check.
    const fromBlock=cursor.blockNumber===0n ? await discoverLaunchBlock(client,context.token) : cursor.blockNumber;
    const reconstructed=await reconstructCanonicalTradesChunked(
      client,context,fromBlock,last.blockNumber,cursor,
      {blockNumber:last.blockNumber,transactionIndex:last.transactionIndex,logIndex:last.logIndex}
    );
    if(reconstructed.length!==trades.length)throw new Error(`Canonical trade count mismatch: proposed=${trades.length} reconstructed=${reconstructed.length}`);
    for(let i=0;i<trades.length;i++)if(!sameTrade(trades[i],reconstructed[i]))throw new Error(`Trade mismatch at index ${i}`);

    const digest=await client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'batchDigest',args:[toContractTrades(trades),deadline]});
    const signature=await account.sign({hash:digest});
    res.json({address:getAddress(account.address),digest,signature});
  }catch(err){res.status(400).json({error:err instanceof Error?err.message:String(err)});}
});

app.listen(config.SIGNER_PORT,config.SIGNER_HOST,()=>console.log(`[signer] ${account.address} on ${config.SIGNER_HOST}:${config.SIGNER_PORT}`));
function toContractTrades(ts:CanonicalTrade[]){return ts.map(t=>({blockNumber:t.blockNumber,transactionIndex:t.transactionIndex,logIndex:t.logIndex,txHash:t.txHash,trader:t.trader,quoteAmount:t.quoteAmount,venue:t.venue,sourceId:t.sourceId,isBuy:t.isBuy}));}
