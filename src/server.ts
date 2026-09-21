import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { getAddress, isAddress } from 'viem';
import { config, validateOperationsConfig } from './config.js';
import { publicClient } from './chain/client.js';
import { ROBINHOOD_CHAIN_ID } from './chain/constants.js';
import { BossDb } from './db.js';
import { DashboardService } from './services/dashboard.js';
import { verifyDeployment } from './services/verify.js';
import { TradeScanner } from './chain/scanner.js';
import { TreasuryEventScanner } from './chain/treasury-events.js';
import { OperationsCoordinator } from './ops/coordinator.js';

validateOperationsConfig();
const db=new BossDb();
const dashboard=new DashboardService(publicClient,db);
const app=express(); const server=http.createServer(app); const wss=new WebSocketServer({server,path:'/ws'});
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const publicDir=path.resolve(__dirname,'../public');

let deployment:any={ok:false,checks:{}};
let lastBroadcast='';
async function broadcast(){
  try{
    const state=await dashboard.state(true); const payload=JSON.stringify({type:'state',data:state});
    if(payload===lastBroadcast)return; lastBroadcast=payload;
    for(const ws of wss.clients)if(ws.readyState===WebSocket.OPEN)ws.send(payload);
  }catch(err){console.error('[broadcast]',err instanceof Error?err.message:err);}
}

app.use(express.json({limit:'64kb'}));
app.use(express.static(publicDir,{extensions:['html']}));
app.get('/api/health',async(_req,res)=>{
  try{const chainId=await publicClient.getChainId();res.json({ok:chainId===ROBINHOOD_CHAIN_ID,chainId,mode:config.APP_MODE,operationsEnabled:config.OPERATIONS_ENABLED,deployment});}
  catch(err){res.status(503).json({ok:false,error:err instanceof Error?err.message:String(err)});}
});
app.get('/api/state',async(_req,res)=>{try{res.json(await dashboard.state(false));}catch(err){res.status(503).json({error:err instanceof Error?err.message:String(err)});}});
app.get('/api/transparency',async(_req,res)=>{try{res.json(await dashboard.transparency());}catch(err){res.status(503).json({error:err instanceof Error?err.message:String(err)});}});
app.get('/api/claimable/:address',async(req,res)=>{
  try{if(!isAddress(req.params.address))return res.status(400).json({error:'invalid address'});res.json({amountWei:await dashboard.claimable(getAddress(req.params.address))});}
  catch(err){res.status(500).json({error:err instanceof Error?err.message:String(err)});}
});
app.get('/api/public-config',(_req,res)=>res.json({
  chainId:4663,chainName:'Robinhood Chain',explorer:'https://robinhoodchain.blockscout.com',
  treasury:config.TREASURY_ADDRESS,feeRouter:config.FEE_ROUTER_ADDRESS,projectRecipient:config.PROJECT_RECIPIENT,expectedPonsDeployer:config.EXPECTED_PONS_DEPLOYER,securityAdmin:config.SECURITY_ADMIN,guardian:config.GUARDIAN,reporters:[config.REPORTER_A,config.REPORTER_B,config.REPORTER_C],
  factory:config.PONS_FACTORY,feeEscrow:config.PONS_FEE_ESCROW,memeHook:config.PONS_MEME_HOOK,poolManager:config.PONS_POOL_MANAGER,
  tokenName:config.TOKEN_NAME,tokenSymbol:config.TOKEN_SYMBOL,logoUri:config.TOKEN_LOGO_URI,description:config.TOKEN_DESCRIPTION,
  website:config.WEBSITE_URL,x:config.X_URL,telegram:config.TELEGRAM_URL,ponsTradeUrl:config.PONS_TRADE_URL,
  demoControls:config.APP_MODE==='demo'&&config.DEMO_CONTROLS
}));
app.post('/api/demo/trade',(req,res)=>{try{if(config.APP_MODE!=='demo'||!config.DEMO_CONTROLS)return res.status(404).end();const side=String(req.body?.side);const eth=Number(req.body?.eth);dashboard.demoTrade(side==='buy',eth);void broadcast();res.json({ok:true});}catch(err){res.status(400).json({error:err instanceof Error?err.message:String(err)});}});
app.use((_req,res)=>res.sendFile(path.join(publicDir,'index.html')));

wss.on('connection',ws=>{void dashboard.state(false).then(data=>ws.send(JSON.stringify({type:'state',data}))).catch(()=>{});});

async function main(){
  const chainId=await publicClient.getChainId(); if(chainId!==ROBINHOOD_CHAIN_ID)throw new Error(`RPC chainId=${chainId}; expected 4663`);
  if(config.APP_MODE==='live'){
    deployment=await verifyDeployment(publicClient); if(!deployment.ok)throw new Error(`Deployment wiring check failed: ${JSON.stringify(deployment.checks)}`);
    console.log('[startup] Treasury/FeeRouter wiring verified');
  } else deployment={ok:true,checks:{demo:true}};
  server.listen(config.PORT,config.HOST,()=>console.log(`[web] http://${config.HOST}:${config.PORT} (${config.APP_MODE})`));
  if(config.APP_MODE==='live'){
    const scanner=new TradeScanner(publicClient,db,()=>void broadcast());
    const events=new TreasuryEventScanner(publicClient,db,()=>void broadcast());
    const ops=new OperationsCoordinator(publicClient,db,()=>void broadcast());
    void scanner.start(); void events.start(); void ops.start();
  }
  setInterval(()=>void broadcast(),Math.max(1500,config.RPC_POLL_MS));
}
main().catch(err=>{console.error(err);process.exit(1);});
