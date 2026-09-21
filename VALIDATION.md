# Validation notes

Updated for v1.1.1 on 2026-09-21.

## Completed locally before v1.1

The v1.0.1 package was validated on the target Mac/Cursor environment:

- `npm run check`: **passed** (full dependency-aware TypeScript check + unit tests).
- `npm run build`: **passed** (`tsc -p tsconfig.build.json`).
- `npm run smoke`: **passed** against Robinhood Chain with `deployment.ok = true`.
- Smoke state matched the expected pre-launch state: Boss #1, 2,000,000 HP, zero settled chest, zero known pending routing, no launch lifecycle yet.
- `npm run dev`: website loaded successfully at `http://localhost:3000` and showed the expected live pre-launch state.

During the live dev run, the public Robinhood RPC began returning `Too Many Requests` on concurrent `eth_call`/`eth_getLogs` traffic. This was an RPC-rate-limit issue, not a contract wiring failure.

## v1.1 / v1.1.1 RPC changes

- Robinhood Chain Multicall3 is declared at `0xcA11bde05977b3631167028862bE2a173976CA11`.
- The main `publicClient` uses viem multicall batching with a 25 ms window.
- Default `RPC_POLL_MS` is now `10000`.
- The website's main viem client uses that polling interval.
- Production should use a dedicated `RPC_HTTP_URL`; the public endpoint is rate-limited.
- v1.1.1 sets `SCAN_CHUNK_BLOCKS=10` and makes the Treasury event scanner use the same configurable chunk size, matching the 10-block `eth_getLogs` range reported by the Alchemy Free tier.
- v1.1.1 adds `RPC_LOG_PAGE_DELAY_MS=75` so catch-up scans do not hammer the RPC with back-to-back log pages.

## Run immediately after opening v1.1.1 in Cursor

If carrying over an existing `.env`, keep your private Alchemy `RPC_HTTP_URL` and make sure it contains `RPC_POLL_MS=10000`, `SCAN_CHUNK_BLOCKS=10`, and `RPC_LOG_PAGE_DELAY_MS=75`. Otherwise:

```bash
cp .env.example .env
npm install
npm run check
npm run build
npm run smoke
npm run dev
```

`npm run smoke` is read-only. Keep `OPERATIONS_ENABLED=false`, `TRADER_ADAPTER_VERIFIED=false` and `V4_REPORTING_ENABLED=false` while validating this version. Let `npm run dev` run for at least one minute and confirm repeated `[broadcast] ... Too Many Requests` errors are gone.

## Intentionally not marked complete yet

These need real post-launch fixtures and are safety-gated in code:

- economic trader attribution for every actual Pons/router path (`TRADER_ADAPTER_VERIFIED=false`);
- graduated V4 trade reconstruction (`V4_REPORTING_ENABLED=false`).

That is a launch-dependent validation boundary, not missing frontend code. The live/read-only website, demo mode, state APIs, scanner, fee keeper, coordinator and signer services are all included.
