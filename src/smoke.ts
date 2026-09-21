import { publicClient } from './chain/client.js';
import { config } from './config.js';
import { ROBINHOOD_CHAIN_ID } from './chain/constants.js';
import { verifyDeployment, getTransparency, getPendingRouting } from './services/verify.js';
import { treasuryAbi } from './chain/abis.js';
import { resolveBossContext } from './chain/context.js';

const chainId=await publicClient.getChainId();
if(chainId!==ROBINHOOD_CHAIN_ID)throw new Error(`Wrong RPC chain ${chainId}`);
const deployment=await verifyDeployment(publicClient);
const [round,hp,maxHp,pot,context,fees,pending]=await Promise.all([
  publicClient.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'roundId'}),
  publicClient.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'currentHp'}),
  publicClient.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'currentBossMaxHp'}),
  publicClient.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'currentPot'}),
  resolveBossContext(publicClient),getTransparency(publicClient),getPendingRouting(publicClient)
]);
console.log(JSON.stringify({chainId,deployment,round:round.toString(),hp:hp.toString(),maxHp:maxHp.toString(),potWei:pot.toString(),lifecycle:context?{expectedToken:context.expectedToken,token:context.token,launchExists:context.launchExists,launchBound:context.launchBound,phase:context.phase}:null,fees,pending},null,2));
if(!deployment.ok)process.exitCode=1;
