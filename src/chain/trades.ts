import { getAddress, pad } from 'viem';
import type { PublicClient } from 'viem';
import { config } from '../config.js';
import type { Address, CanonicalTrade, ChainCursor, Hex } from '../shared/types.js';
import { compareTradePosition, positionAfter } from '../shared/types.js';
import { curveBuyEvent, curveSellEvent, v4SwapEvent } from './abis.js';
import type { BossChainContext } from './context.js';
import { ZERO_BYTES32 } from './constants.js';

function addressSourceId(address: Address): Hex {
  return pad(address, { size: 32, dir: 'left' }) as Hex;
}

async function txIndexFor(client: PublicClient, log: any): Promise<number> {
  if (log.transactionIndex != null) return Number(log.transactionIndex);
  if (!log.transactionHash) throw new Error('Trade log has no transaction hash');
  const receipt = await client.getTransactionReceipt({ hash: log.transactionHash });
  return Number(receipt.transactionIndex);
}

async function traderFor(client: PublicClient, txHash: Hex, cache: Map<string, Address>): Promise<Address> {
  const k = txHash.toLowerCase();
  const hit = cache.get(k);
  if (hit) return hit;
  const tx = await client.getTransaction({ hash: txHash });
  const trader = getAddress(tx.from) as Address;
  cache.set(k, trader);
  if (cache.size > 1000) cache.delete(cache.keys().next().value!);
  return trader;
}

function v4Quote(amount0: bigint, amount1: bigint, quoteIsCurrency0: boolean) {
  const delta = quoteIsCurrency0 ? amount0 : amount1;
  if (delta === 0n) return null;
  // Uniswap v4 Swap event deltas are swapper-centric: negative means the
  // swapper paid that currency, positive means the swapper received it.
  return delta < 0n ? { isBuy: true, quoteAmount: -delta } : { isBuy: false, quoteAmount: delta };
}

export async function reconstructCanonicalTrades(
  client: PublicClient,
  context: BossChainContext,
  fromBlock: bigint,
  toBlock: bigint,
  cursor?: ChainCursor,
  through?: ChainCursor,
): Promise<CanonicalTrade[]> {
  if (!context.launchExists || context.curve === '0x0000000000000000000000000000000000000000') return [];
  if (toBlock < fromBlock) return [];

  const promises: Promise<any[]>[] = [
    client.getLogs({ address: context.curve, event: curveBuyEvent, fromBlock, toBlock }) as Promise<any[]>,
    client.getLogs({ address: context.curve, event: curveSellEvent, fromBlock, toBlock }) as Promise<any[]>,
  ];
  const poolId = context.computedPoolId;
  if (poolId !== ZERO_BYTES32) {
    promises.push(client.getLogs({
      address: config.PONS_POOL_MANAGER,
      event: v4SwapEvent,
      args: { id: poolId },
      fromBlock,
      toBlock,
    }) as Promise<any[]>);
  }

  const logs = (await Promise.all(promises)).flat();
  const txCache = new Map<string, Address>();
  const quoteIsCurrency0 = context.pairToken.toLowerCase() < context.token.toLowerCase();
  const out: CanonicalTrade[] = [];

  for (const log of logs) {
    if (!log.transactionHash || log.blockNumber == null || log.logIndex == null) continue;
    const txHash = log.transactionHash as Hex;
    const blockNumber = BigInt(log.blockNumber);
    const transactionIndex = await txIndexFor(client, log);
    const logIndex = Number(log.logIndex);
    let isBuy: boolean;
    let quoteAmount: bigint;
    let venue: 0 | 1;
    let sourceId: Hex;

    if (String(log.address).toLowerCase() === context.curve.toLowerCase()) {
      venue = 0;
      sourceId = addressSourceId(context.curve);
      if (log.eventName === 'CurveBuy') {
        isBuy = true;
        quoteAmount = BigInt(log.args?.quoteIn ?? 0n);
      } else if (log.eventName === 'CurveSell') {
        isBuy = false;
        quoteAmount = BigInt(log.args?.quoteOut ?? 0n);
      } else continue;
    } else {
      venue = 1;
      sourceId = poolId;
      const parsed = v4Quote(BigInt(log.args?.amount0 ?? 0n), BigInt(log.args?.amount1 ?? 0n), quoteIsCurrency0);
      if (!parsed) continue;
      ({ isBuy, quoteAmount } = parsed);
    }
    if (quoteAmount <= 0n) continue;
    if (quoteAmount >= (1n << 96n)) throw new Error(`quoteAmount exceeds uint96 at ${txHash}:${logIndex}`);
    const trader = await traderFor(client, txHash, txCache);
    const trade: CanonicalTrade = { blockNumber, transactionIndex, logIndex, txHash, trader, quoteAmount, venue, sourceId, isBuy };
    if (cursor && !positionAfter(trade, cursor)) continue;
    if (through && compareTradePosition(trade, through) > 0) continue;
    out.push(trade);
  }

  out.sort(compareTradePosition);
  return out;
}

export function sameTrade(a: CanonicalTrade, b: CanonicalTrade) {
  return a.blockNumber === b.blockNumber && a.transactionIndex === b.transactionIndex && a.logIndex === b.logIndex &&
    a.txHash.toLowerCase() === b.txHash.toLowerCase() && a.trader.toLowerCase() === b.trader.toLowerCase() &&
    a.quoteAmount === b.quoteAmount && a.venue === b.venue && a.sourceId.toLowerCase() === b.sourceId.toLowerCase() &&
    a.isBuy === b.isBuy;
}

export async function reconstructCanonicalTradesChunked(
  client: PublicClient,
  context: BossChainContext,
  fromBlock: bigint,
  toBlock: bigint,
  cursor?: ChainCursor,
  through?: ChainCursor,
  chunkBlocks = config.SCAN_CHUNK_BLOCKS,
): Promise<CanonicalTrade[]> {
  if (toBlock < fromBlock) return [];
  const out: CanonicalTrade[] = [];
  let from = fromBlock;
  const step = BigInt(Math.max(1, chunkBlocks));
  while (from <= toBlock) {
    const to = from + step - 1n > toBlock ? toBlock : from + step - 1n;
    out.push(...await reconstructCanonicalTrades(client, context, from, to, cursor, through));
    from = to + 1n;
  }
  out.sort(compareTradePosition);
  return out;
}
