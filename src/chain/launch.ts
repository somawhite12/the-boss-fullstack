import type { PublicClient } from 'viem';
import { config } from '../config.js';
import type { Address } from '../shared/types.js';
import { tokenLaunchedEvent } from './abis.js';

/**
 * Resolve the block that emitted Pons TokenLaunched for a token.
 *
 * A signer with an on-chain Treasury cursor > 0 never needs this lookup. A
 * fresh signer at cursor 0 does: starting at the launch block avoids an
 * enormous eth_getLogs range from genesis on Robinhood Chain.
 */
export async function discoverLaunchBlock(client: PublicClient, token: Address): Promise<bigint> {
  if (config.TOKEN_LAUNCH_BLOCK > 0) return BigInt(config.TOKEN_LAUNCH_BLOCK);

  const latest = await client.getBlockNumber();
  const lookback = BigInt(config.LAUNCH_DISCOVERY_LOOKBACK);
  const floor = latest > lookback ? latest - lookback : 0n;
  const chunk = BigInt(config.SCAN_CHUNK_BLOCKS);

  // Search newest -> oldest in bounded ranges. There should be exactly one
  // TokenLaunched event for this token, but walking backwards lets us return as
  // soon as it is found and stays friendly to RPC providers with range limits.
  let to = latest;
  while (to >= floor) {
    const from = to + 1n > chunk ? to - chunk + 1n : 0n;
    const boundedFrom = from < floor ? floor : from;
    const logs = await client.getLogs({
      address: config.PONS_FACTORY,
      event: tokenLaunchedEvent,
      args: { token },
      fromBlock: boundedFrom,
      toBlock: to,
    });
    if (logs.length && logs[0].blockNumber != null) return BigInt(logs[0].blockNumber);
    if (boundedFrom === floor || boundedFrom === 0n) break;
    to = boundedFrom - 1n;
    if (config.RPC_LOG_PAGE_DELAY_MS > 0) await sleep(config.RPC_LOG_PAGE_DELAY_MS);
  }

  throw new Error(
    `Could not find TokenLaunched for ${token} in the last ${config.LAUNCH_DISCOVERY_LOOKBACK} blocks. ` +
    'Set TOKEN_LAUNCH_BLOCK to the known launch block or increase LAUNCH_DISCOVERY_LOOKBACK.'
  );
}

function sleep(ms:number){ return new Promise(r => setTimeout(r, ms)); }
