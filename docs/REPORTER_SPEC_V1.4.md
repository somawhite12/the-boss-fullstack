# Reporter specification

## Purpose

Convert canonical Pons V2 trade logs into deterministic EIP-712 batches for `BossGameTreasury`.

## Quorum

Three signing keys, two signatures required per batch. Reporter keys must be different from the Security Admin and Guardian.

Recommended separation:

- Reporter A: Alchemy RPC + isolated signer A.
- Reporter B: independent provider (e.g. QuickNode/dRPC) + isolated signer B.
- Reporter C: separate provider or self-hosted verifier + isolated signer C.

At least two reporters should independently reconstruct the batch from chain data instead of blindly signing a batch supplied by one service.

## Canonical trade identity

Each attested trade contains:

- `blockNumber`
- `transactionIndex`
- `logIndex`
- `txHash`
- `trader`
- `quoteAmount`
- `venue`
- `sourceId`
- `isBuy`

For V1 launch operations, `trader` is defined as the economic transaction sender resolved by the adapter. The initial production adapter must have explicit tests for direct wallets, the Pons launch-and-buy path and every router used by the chosen trading frontends. Never silently attribute a router/bundler as a user without a documented rule.

## Amount rule

- Curve BUY: use actual `quoteIn` from `CurveBuy` after any clamped-fill refund.
- Curve SELL: use actual net `quoteOut` from `CurveSell`.
- V4: reconstruct the equivalent actual ETH spent/received from the canonical Pons pool/hook swap data. The adapter must be fixture-tested against real Pons V4 transactions before mainnet.

## Ordering

Trades must be submitted strictly by `(blockNumber, transactionIndex, logIndex)`.

A reporter must never sign past a gap. If an RPC provider disagrees or a receipt/log is missing, halt and reconcile instead of advancing the cursor.

## Confirmation rule

The contract enforces at least `MIN_BLOCK_LAG` L2 blocks. Reporter policy may wait longer. The website may show trades immediately as **provisional**, while on-chain HP/winner state should be labeled **confirmed** only after the attested batch lands.

## Fee keeper ordering

The keeper independently maintains Pons fee settlement:

1. trigger a curve/pool fee sweep where permitted;
2. `BossFeeRouter.harvest()`;
3. `BossFeeRouter.releaseTreasury()`;
4. `BossFeeRouter.releaseProject()`.

Only ETH already received by `BossGameTreasury` appears in `currentPot` and is prize-eligible. Pending/unswept Pons fees should be displayed separately, never added to the public chest number.
