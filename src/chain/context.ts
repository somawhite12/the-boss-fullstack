import { encodeAbiParameters, getAddress, keccak256 } from 'viem';
import type { PublicClient } from 'viem';
import { config } from '../config.js';
import type { Address, Hex } from '../shared/types.js';
import { ponsFactoryAbi, treasuryAbi } from './abis.js';
import { ZERO_ADDRESS, ZERO_BYTES32 } from './constants.js';

export interface BossChainContext {
  expectedToken: Address;
  token: Address;
  curve: Address;
  feeRouter: Address;
  launchBound: boolean;
  launchExists: boolean;
  phase: number;
  pairToken: Address;
  poolFee: number;
  tickSpacing: number;
  computedPoolId: Hex;
  boundPoolId: Hex;
}

function asAddress(v: string): Address { return getAddress(v) as Address; }

export function computePoolId(token: Address, pairToken: Address, poolFee: number, tickSpacing: number): Hex {
  const [currency0, currency1] = pairToken.toLowerCase() < token.toLowerCase()
    ? [pairToken, token]
    : [token, pairToken];
  return keccak256(encodeAbiParameters(
    [{ type: 'address' }, { type: 'address' }, { type: 'uint24' }, { type: 'int24' }, { type: 'address' }],
    [currency0, currency1, poolFee, tickSpacing, config.PONS_MEME_HOOK]
  ));
}

export async function resolveBossContext(client: PublicClient): Promise<BossChainContext | null> {
  const [expectedRaw, launchRaw, curveRaw, feeRouterRaw, boundPoolId] = await Promise.all([
    client.readContract({ address: config.TREASURY_ADDRESS, abi: treasuryAbi, functionName: 'expectedToken' }),
    client.readContract({ address: config.TREASURY_ADDRESS, abi: treasuryAbi, functionName: 'launchToken' }),
    client.readContract({ address: config.TREASURY_ADDRESS, abi: treasuryAbi, functionName: 'bondingCurve' }),
    client.readContract({ address: config.TREASURY_ADDRESS, abi: treasuryAbi, functionName: 'feeRouter' }),
    client.readContract({ address: config.TREASURY_ADDRESS, abi: treasuryAbi, functionName: 'v4PoolId' }),
  ]);
  const expectedToken = asAddress(expectedRaw);
  const launchToken = asAddress(launchRaw);
  const candidate = launchToken !== ZERO_ADDRESS ? launchToken : expectedToken;
  if (candidate === ZERO_ADDRESS) return null;

  let launch: Awaited<ReturnType<typeof client.readContract>> | any;
  try {
    launch = await client.readContract({ address: config.PONS_FACTORY, abi: ponsFactoryAbi, functionName: 'getLaunchedToken', args: [candidate] });
  } catch {
    return {
      expectedToken,
      token: candidate,
      curve: asAddress(curveRaw),
      feeRouter: asAddress(feeRouterRaw),
      launchBound: launchToken !== ZERO_ADDRESS,
      launchExists: false,
      phase: 0,
      pairToken: ZERO_ADDRESS,
      poolFee: 0,
      tickSpacing: 0,
      computedPoolId: ZERO_BYTES32,
      boundPoolId: boundPoolId as Hex,
    };
  }

  if (!launch.exists) {
    return {
      expectedToken,
      token: candidate,
      curve: asAddress(curveRaw),
      feeRouter: asAddress(feeRouterRaw),
      launchBound: launchToken !== ZERO_ADDRESS,
      launchExists: false,
      phase: 0,
      pairToken: ZERO_ADDRESS,
      poolFee: 0,
      tickSpacing: 0,
      computedPoolId: ZERO_BYTES32,
      boundPoolId: boundPoolId as Hex,
    };
  }

  const token = asAddress(launch.token);
  const pairToken = asAddress(launch.pairToken);
  return {
    expectedToken,
    token,
    curve: asAddress(launch.curve),
    feeRouter: asAddress(launch.creatorFeeRecipient),
    launchBound: launchToken !== ZERO_ADDRESS,
    launchExists: true,
    phase: Number(launch.phase),
    pairToken,
    poolFee: Number(launch.poolFee),
    tickSpacing: Number(launch.tickSpacing),
    computedPoolId: computePoolId(token, pairToken, Number(launch.poolFee), Number(launch.tickSpacing)),
    boundPoolId: boundPoolId as Hex,
  };
}
