export type Hex = `0x${string}`;
export type Address = `0x${string}`;

export interface CanonicalTrade {
  blockNumber: bigint;
  transactionIndex: number;
  logIndex: number;
  txHash: Hex;
  trader: Address;
  quoteAmount: bigint;
  venue: 0 | 1;
  sourceId: Hex;
  isBuy: boolean;
}

export interface JsonTrade {
  blockNumber: string;
  transactionIndex: number;
  logIndex: number;
  txHash: Hex;
  trader: Address;
  quoteAmount: string;
  venue: 0 | 1;
  sourceId: Hex;
  isBuy: boolean;
  status?: string;
}

export interface ChainCursor {
  blockNumber: bigint;
  transactionIndex: number;
  logIndex: number;
}

export interface FeedItem {
  id: string;
  type: 'buy' | 'sell' | 'boss_defeated' | 'boss_started' | 'prize_claimed' | 'system';
  message: string;
  txHash?: Hex;
  trader?: Address;
  quoteWei?: string;
  blockNumber?: string;
  createdAt: number;
  provisional?: boolean;
}

export function tradeToJson(t: CanonicalTrade, status?: string): JsonTrade {
  return {
    blockNumber: t.blockNumber.toString(),
    transactionIndex: t.transactionIndex,
    logIndex: t.logIndex,
    txHash: t.txHash,
    trader: t.trader,
    quoteAmount: t.quoteAmount.toString(),
    venue: t.venue,
    sourceId: t.sourceId,
    isBuy: t.isBuy,
    status,
  };
}

export function jsonToTrade(t: JsonTrade): CanonicalTrade {
  return {
    blockNumber: BigInt(t.blockNumber),
    transactionIndex: t.transactionIndex,
    logIndex: t.logIndex,
    txHash: t.txHash,
    trader: t.trader,
    quoteAmount: BigInt(t.quoteAmount),
    venue: t.venue,
    sourceId: t.sourceId,
    isBuy: t.isBuy,
  };
}

export function compareTradePosition(a: Pick<CanonicalTrade, 'blockNumber'|'transactionIndex'|'logIndex'>, b: Pick<CanonicalTrade, 'blockNumber'|'transactionIndex'|'logIndex'>) {
  if (a.blockNumber < b.blockNumber) return -1;
  if (a.blockNumber > b.blockNumber) return 1;
  if (a.transactionIndex !== b.transactionIndex) return a.transactionIndex - b.transactionIndex;
  return a.logIndex - b.logIndex;
}

export function positionAfter(t: CanonicalTrade, c: ChainCursor) {
  return compareTradePosition(t, c) > 0;
}
