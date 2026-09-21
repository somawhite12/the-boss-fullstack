# THE BOSS architecture

```text
Pons V2 curve / graduated V4 pool
              │
              ▼
     canonical log scanner
 block → txIndex → logIndex ordering
              │
              ├────► live provisional raid feed
              │
              ▼
       coordinator (optional)
              │
      before EVERY batch:
      fee sweep → harvest →
      release treasury/project
              │
              ▼
   Reporter A/B/C signer services
  independent RPC + full gap check
              │  2-of-3 raw ECDSA
              ▼
      BossGameTreasury
      submitTradeBatch()
              │
              ├────► on-chain HP
              ├────► final blow winner
              └────► pull-based claim
```


## RPC/read path

The main website/backend client uses Robinhood Chain Multicall3 to batch concurrent contract reads and a conservative 10-second default polling interval. This reduces request bursts against the rate-limited public RPC. The public endpoint is a development/read-only fallback; production should configure a dedicated `RPC_HTTP_URL`. Reporter signers remain intentionally separate and should use independent RPC providers.

## Authority boundaries

The browser never decides HP, the winner, or prize size. It displays the `BossGameTreasury` state. Detected Pons trades may appear as provisional, but only a successful reporter batch changes confirmed HP.

The server never holds winner funds. `BossFeeRouter` routes ETH to `BossGameTreasury`; the winner calls `claim()` directly.

## Reporter design

The coordinator does **not** ask signers to blindly sign a digest. Each signer receives the proposed canonical trades, independently queries its own RPC, reconstructs all Pons curve/V4 trade logs from the Treasury's current cursor through the proposed final log, rejects gaps/reordering/data mismatches, asks the Treasury contract for the exact `batchDigest`, then signs that raw digest.

Run at least two signers on independent providers/machines in production. Three is preferred.

## Final-blow batch boundary

The coordinator simulates HP and ends a batch at the first trade that can kill the active Boss. It performs the keeper settlement sequence before submitting the batch. Trades after a final blow are never intentionally bundled into the same reporter batch.

## Graduation

The scanner computes the canonical Pons V4 PoolId from the launch record and can watch curve + pool across the lifecycle. The coordinator permissionlessly calls `bindV4Pool` after Pons reports `PoolCreated`.

`V4_REPORTING_ENABLED=false` is intentionally the default. The frozen V1.4 reporter spec requires the V4 quote reconstruction to be fixture-tested against real Pons V4 transactions before production. Once that test is done, set it to `true` on the coordinator and all signer services.

## Launch-dependent safety gates

Two things deliberately remain gated until KBOSS exists and the actual trading paths can be exercised:

1. **Trader attribution.** The current curve adapter uses `transaction.from` as the economic sender. That is safe for direct calls but must be fixture-tested for the Pons launch-and-buy path and every router/bundler linked from the production site. Reporter services refuse to start unless `TRADER_ADAPTER_VERIFIED=true`.
2. **V4 reconstruction.** PoolManager swap logs can include non-user/internal activity, and quote direction must be proven against real Pons graduated swaps. `V4_REPORTING_ENABLED=false` remains mandatory until those fixtures pass.

A fresh reporter signer discovers the token's `TokenLaunched` block and reconstructs in bounded RPC chunks, so it never weakens gap checking by issuing an impractical genesis-to-tip log query.

Reporter signer HTTP endpoints bind to `127.0.0.1` by default. If a signer is intentionally exposed beyond localhost, the process requires `REPORTER_SIGNER_AUTH_TOKEN`; production should additionally use private networking/TLS/firewall rules.
