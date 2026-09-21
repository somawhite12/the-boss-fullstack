import type { Address, PublicClient } from 'viem';
import { getAddress } from 'viem';
import { config } from '../config.js';
import { curveAbi, feeEscrowAbi, feeRouterAbi, memeHookAbi, ponsFactoryAbi, treasuryAbi } from '../chain/abis.js';
import { resolveBossContext } from '../chain/context.js';
import { ZERO_ADDRESS } from '../chain/constants.js';

const eq = (a:string,b:string) => a.toLowerCase() === b.toLowerCase();

export async function verifyDeployment(client: PublicClient) {
  const [factory, expectedDeployer, admin, guardian, project, hpPerEth, maxHp, r0, r1, r2, routerFactory, escrow, routerTreasury, routerProject, treasuryBps, projectBps] = await Promise.all([
    client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'ponsFactory'}),
    client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'expectedPonsDeployer'}),
    client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'securityAdmin'}),
    client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'guardian'}),
    client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'expectedProjectRecipient'}),
    client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'hpPerEth'}),
    client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'maxHp'}),
    client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'reporters',args:[0n]}),
    client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'reporters',args:[1n]}),
    client.readContract({address:config.TREASURY_ADDRESS,abi:treasuryAbi,functionName:'reporters',args:[2n]}),
    client.readContract({address:config.FEE_ROUTER_ADDRESS,abi:feeRouterAbi,functionName:'ponsFactory'}),
    client.readContract({address:config.FEE_ROUTER_ADDRESS,abi:feeRouterAbi,functionName:'ponsFeeEscrow'}),
    client.readContract({address:config.FEE_ROUTER_ADDRESS,abi:feeRouterAbi,functionName:'treasury'}),
    client.readContract({address:config.FEE_ROUTER_ADDRESS,abi:feeRouterAbi,functionName:'projectRecipient'}),
    client.readContract({address:config.FEE_ROUTER_ADDRESS,abi:feeRouterAbi,functionName:'TREASURY_BPS'}),
    client.readContract({address:config.FEE_ROUTER_ADDRESS,abi:feeRouterAbi,functionName:'PROJECT_BPS'}),
  ]);

  const checks = {
    factory: eq(factory, config.PONS_FACTORY),
    expectedPonsDeployer: eq(expectedDeployer, config.EXPECTED_PONS_DEPLOYER),
    admin: eq(admin, config.SECURITY_ADMIN),
    guardian: eq(guardian, config.GUARDIAN),
    projectRecipient: eq(project, config.PROJECT_RECIPIENT),
    hpPerEth: BigInt(hpPerEth) === 1_000_000n,
    maxHp: BigInt(maxHp) === 50_000_000n,
    reporters: eq(r0,config.REPORTER_A) && eq(r1,config.REPORTER_B) && eq(r2,config.REPORTER_C),
    routerFactory: eq(routerFactory,config.PONS_FACTORY),
    feeEscrow: eq(escrow,config.PONS_FEE_ESCROW),
    routerTreasury: eq(routerTreasury,config.TREASURY_ADDRESS),
    routerProject: eq(routerProject,config.PROJECT_RECIPIENT),
    split: BigInt(treasuryBps) === 8000n && BigInt(projectBps) === 2000n,
  };
  return { ok: Object.values(checks).every(Boolean), checks };
}

export async function getTransparency(client: PublicClient) {
  const context = await resolveBossContext(client);
  const [snipeStart, snipeSeconds, launchFee, maxCreatorTax, liveProtocolShare, liveHookFee, liveBuybackShare, liveMaxImpact] = await Promise.all([
    client.readContract({address:config.PONS_FACTORY,abi:ponsFactoryAbi,functionName:'snipeTaxStartBps'}).catch(()=>0n),
    client.readContract({address:config.PONS_FACTORY,abi:ponsFactoryAbi,functionName:'snipeTaxSeconds'}).catch(()=>0n),
    client.readContract({address:config.PONS_FACTORY,abi:ponsFactoryAbi,functionName:'launchFee'}).catch(()=>0n),
    client.readContract({address:config.PONS_FACTORY,abi:ponsFactoryAbi,functionName:'maxCreatorTaxBps'}).catch(()=>0n),
    client.readContract({address:config.PONS_MEME_HOOK,abi:memeHookAbi,functionName:'protocolFeeShareBps'}).catch(()=>3000n),
    client.readContract({address:config.PONS_MEME_HOOK,abi:memeHookAbi,functionName:'hookFeeBps'}).catch(()=>100n),
    client.readContract({address:config.PONS_MEME_HOOK,abi:memeHookAbi,functionName:'buybackBurnBps'}).catch(()=>5000n),
    client.readContract({address:config.PONS_MEME_HOOK,abi:memeHookAbi,functionName:'maxInternalPriceImpactBps'}).catch(()=>300n),
  ]);

  let creatorTaxBps = 400;
  let baseFeeBps = Number(liveHookFee);
  let protocolShareBps = Number(liveProtocolShare);
  let buybackEnabled = false;
  let override: { newRecipient: Address; effectiveAt: bigint; expiresAt: bigint } = {
    newRecipient: ZERO_ADDRESS, effectiveAt: 0n, expiresAt: 0n,
  };
  let launchRecipient: Address = ZERO_ADDRESS;

  if (context?.launchExists) {
    const [launch, policy, pending] = await Promise.all([
      client.readContract({address:config.PONS_FACTORY,abi:ponsFactoryAbi,functionName:'getLaunchedToken',args:[context.token]}),
      client.readContract({address:config.PONS_FACTORY,abi:ponsFactoryAbi,functionName:'getLaunchFeePolicy',args:[context.token]}),
      client.readContract({address:config.PONS_FACTORY,abi:ponsFactoryAbi,functionName:'pendingCreatorFeeRecipient',args:[context.token]}),
    ]);
    creatorTaxBps = Number(launch.creatorTaxBps);
    buybackEnabled = Boolean(launch.buybackEnabled);
    launchRecipient = getAddress(launch.creatorFeeRecipient);
    baseFeeBps = Number(policy.hookFeeBps);
    protocolShareBps = Number(policy.protocolFeeShareBps);
    override = { newRecipient:getAddress(pending[0]), effectiveAt:BigInt(pending[1]), expiresAt:BigInt(pending[2]) };
  }

  const protocolVolumeBps = Math.floor(baseFeeBps * protocolShareBps / 10_000);
  const creatorBaseVolumeBps = baseFeeBps - protocolVolumeBps;
  const routerVolumeBps = creatorTaxBps + creatorBaseVolumeBps;
  const chestVolumeBps = Math.floor(routerVolumeBps * 8000 / 10_000);
  const projectVolumeBps = routerVolumeBps - chestVolumeBps;

  return {
    baseFeeBps, creatorTaxBps, normalTotalBps: baseFeeBps + creatorTaxBps,
    protocolShareBps, protocolVolumeBps, creatorBaseVolumeBps, routerVolumeBps,
    chestVolumeBps, projectVolumeBps, buybackEnabled,
    snipeTaxStartBps:Number(snipeStart), snipeTaxSeconds:Number(snipeSeconds),
    launchFeeWei:BigInt(launchFee).toString(), maxCreatorTaxBps:Number(maxCreatorTax),
    currentHook: { protocolFeeShareBps:Number(liveProtocolShare), hookFeeBps:Number(liveHookFee), buybackBurnBps:Number(liveBuybackShare), maxInternalPriceImpactBps:Number(liveMaxImpact) },
    creatorFeeRecipient: launchRecipient,
    pendingCreatorFeeRecipient: { newRecipient:override.newRecipient, effectiveAt:override.effectiveAt.toString(), expiresAt:override.expiresAt.toString(), active:override.newRecipient !== ZERO_ADDRESS },
  };
}

export async function getPendingRouting(client: PublicClient) {
  const [escrowOwed, treasuryAccrued, projectAccrued, accounting, context] = await Promise.all([
    client.readContract({address:config.PONS_FEE_ESCROW,abi:feeEscrowAbi,functionName:'balanceOf',args:[config.FEE_ROUTER_ADDRESS]}).catch(()=>0n),
    client.readContract({address:config.FEE_ROUTER_ADDRESS,abi:feeRouterAbi,functionName:'treasuryAccrued'}).catch(()=>0n),
    client.readContract({address:config.FEE_ROUTER_ADDRESS,abi:feeRouterAbi,functionName:'projectAccrued'}).catch(()=>0n),
    client.readContract({address:config.FEE_ROUTER_ADDRESS,abi:feeRouterAbi,functionName:'accounting'}).catch(()=>[0n,0n,0n] as const),
    resolveBossContext(client).catch(()=>null),
  ]);

  let curveBaseFeePending = 0n;
  let curveCreatorTaxPending = 0n;
  let estimatedCurveRouterPending = 0n;
  let curveEstimateAvailable = false;

  if (context?.launchExists && context.phase === 0 && context.curve !== ZERO_ADDRESS) {
    const [basePending, taxPending, launch, policy] = await Promise.all([
      client.readContract({address:context.curve,abi:curveAbi,functionName:'quoteFeeBalance'}).catch(()=>0n),
      client.readContract({address:context.curve,abi:curveAbi,functionName:'creatorTaxBalance'}).catch(()=>0n),
      client.readContract({address:config.PONS_FACTORY,abi:ponsFactoryAbi,functionName:'getLaunchedToken',args:[context.token]}).catch(()=>null),
      client.readContract({address:config.PONS_FACTORY,abi:ponsFactoryAbi,functionName:'getLaunchFeePolicy',args:[context.token]}).catch(()=>null),
    ]);
    curveBaseFeePending = BigInt(basePending);
    curveCreatorTaxPending = BigInt(taxPending);
    if (launch && policy && !Boolean(launch.buybackEnabled)) {
      const protocol = curveBaseFeePending * BigInt(policy.protocolFeeShareBps) / 10_000n;
      estimatedCurveRouterPending = curveBaseFeePending - protocol + curveCreatorTaxPending;
      curveEstimateAvailable = true;
    }
  }

  const routerBalance = BigInt(accounting[0]);
  const knownAfterCurve = BigInt(escrowOwed) + routerBalance;
  const knownRouterPending = knownAfterCurve + (curveEstimateAvailable ? estimatedCurveRouterPending : 0n);

  return {
    escrowOwedWei: BigInt(escrowOwed).toString(),
    treasuryAccruedWei: BigInt(treasuryAccrued).toString(),
    projectAccruedWei: BigInt(projectAccrued).toString(),
    routerUnallocatedWei: BigInt(accounting[2]).toString(),
    routerBalanceWei: routerBalance.toString(),
    curveBaseFeePendingWei: curveBaseFeePending.toString(),
    curveCreatorTaxPendingWei: curveCreatorTaxPending.toString(),
    estimatedCurveRouterPendingWei: curveEstimateAvailable ? estimatedCurveRouterPending.toString() : null,
    totalKnownRouterPendingWei: knownRouterPending.toString(),
  };
}
