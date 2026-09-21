# KILL THE BOSS — full-stack website + operations backend (v1.1)

This is the website/backend build for **KILL THE BOSS (`KBOSS`)** on **Robinhood Chain (chain ID 4663)**.

It is designed around the already-deployed V1.4 contracts:

- `BossGameTreasury`: `0x56245Ea05CfDB874e7678C590118C193CAceE049`
- `BossFeeRouter`: `0xC1A6cEb8Ab361E6BFd8B7A61d5536B86235C06F3`
- Pons V2 factory: `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e`
- Pons fee escrow: `0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e`
- Pons meme hook: `0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044`
- Pons PoolManager: `0x8366a39CC670B4001A1121B8F6A443A643e40951`

The token is **not launched**. That is supported intentionally: the site can run now in live read-only pre-launch mode and will show the real deployed Treasury state.

## What is included

The zip is one Node project with:

- full responsive frontend in `public/`
- live Robinhood Chain contract state
- on-chain chest / HP / round display
- transparency / VERIFY panel
- wallet connection and direct `claim()` button
- canonical Pons curve trade scanner
- automatic lifecycle resolution from `expectedToken` / `launchToken`
- graduated Pons V4 PoolId calculation and scanner
- persistent SQLite state using Node's built-in `node:sqlite`
- provisional vs confirmed raid feed
- 2-of-3 reporter coordinator
- independent reporter signer service
- gap/reordering protection in every signer
- keeper sequence: sweep → harvest → release Treasury → release project
- automatic `bindLaunch()` / `bindV4Pool()` when operations are enabled
- hard safety gate for trader attribution before reporter signing can be enabled
- chunked independent signer reconstruction (no genesis-sized log query on first batch)
- optional bearer auth + localhost-only default for reporter signer services
- hard batch boundary at the first final blow
- demo mode for UI/game testing before KBOSS exists
- Docker support
- unit tests for HP/batch ordering and current fee economics

## 1. Run it now — live read-only mode

Node 24 is perfect.

```bash
cp .env.example .env
npm install
npm run check
npm run build
npm run smoke
npm run dev
```

Open:

```text
http://localhost:3000
```

The default `.env.example` already contains the public production contract addresses. **No private key is required.** `OPERATIONS_ENABLED=false` is the safe default.

The v1.1 default uses `RPC_POLL_MS=10000` and Multicall3 batching on the main public client to reduce burst pressure on Robinhood's rate-limited public RPC. For public production traffic, point `RPC_HTTP_URL` at a dedicated Robinhood Chain provider instead of relying on the public endpoint.

The server refuses to start in live mode if the deployed Treasury/FeeRouter wiring does not match the expected production roles/split.

## 2. Test the visuals before launch

Set:

```dotenv
APP_MODE=demo
```

Restart `npm run dev`. Two demo controls appear in the activity panel. They exercise the same HP schedule visually without sending any chain transaction.

Return to:

```dotenv
APP_MODE=live
```

before testing real contract reads.

## 3. Token lifecycle

You do **not** configure a fake token address now.

The backend reads:

1. `BossGameTreasury.expectedToken()` while the future KBOSS address is armed;
2. the Pons factory launch record once that token actually exists;
3. `BossGameTreasury.launchToken()` once `bindLaunch()` has succeeded;
4. the computed Pons V4 PoolId after graduation.

This is deliberate: one source of truth, no duplicated token address in the website config.

## 4. Production reporter/keeper operations

Keep operations disabled until the relayer and independent reporter signers are ready. The V1.4 reporter specification also requires explicit trader-attribution fixtures for the exact trading paths we will use. Therefore `TRADER_ADAPTER_VERIFIED=false` is the safe default and reporter operations refuse to start until that gate is intentionally flipped after those fixtures pass.

Production topology:

```text
web/coordinator RPC A
reporter A signer → RPC A/independent
reporter B signer → RPC B/independent
reporter C signer → RPC C/independent
```

Each signer should run on a separate process/machine and receive only its own reporter private key via a secret manager or `.env` file that is never committed.

Example signer A environment:

```dotenv
SIGNER_PORT=4101
SIGNER_RPC_URL=https://YOUR-INDEPENDENT-ROBINHOOD-RPC
REPORTER_PRIVATE_KEY=0x...
TRADER_ADAPTER_VERIFIED=true   # only after launch-path/router fixtures pass
V4_REPORTING_ENABLED=false
```

Start it:

```bash
npm run signer
```

Repeat for B/C with their own key, port and preferably provider.

The main coordinator needs a **separate funded relayer** secret:

```dotenv
OPERATIONS_ENABLED=true
RELAYER_PRIVATE_KEY=0x...
REPORTER_SIGNER_URLS=https://signer-a.example,https://signer-b.example,https://signer-c.example
REPORTER_SIGNER_AUTH_TOKEN=<secret shared HTTP bearer token>
TRADER_ADAPTER_VERIFIED=true
```

The relayer does not need to be a reporter. It pays gas for keeper calls and `submitTradeBatch`.

### Reporter safety

The current adapter attributes a curve trade to the outer EVM transaction sender (`transaction.from`). That is correct for direct wallet calls but **must not be assumed correct for routers/bundlers**. Before production reporting, fixture-test the exact Pons UI / launch-and-buy path / router paths you will expose and document the economic sender rule. Only then set `TRADER_ADAPTER_VERIFIED=true`.

A helper is included for building those fixtures after launch:

```bash
npm run inspect:tx -- 0xYOUR_TRADE_TX_HASH
```

It prints `transaction.from`, the Pons curve buyer/seller + recipient, and matching V4 swap deltas so the economic-wallet rule can be verified rather than guessed.

Signer services do not blindly sign coordinator data. Before signing they independently:

- read the current Treasury cursor;
- reconstruct every canonical Pons log through the proposed last trade;
- derive trader from `transaction.from`;
- validate quote amount / venue / source;
- reject missing, reordered or changed trades;
- enforce confirmation depth;
- request the exact `batchDigest` from `BossGameTreasury`;
- start a fresh signer at the Pons `TokenLaunched` block and scan in bounded chunks rather than querying from genesis;
- sign that raw digest only if the signer address is an active reporter.

## 5. V4 safety gate

Keep:

```dotenv
V4_REPORTING_ENABLED=false
```

until we have fixture-tested the V4 quote-direction parser against real Pons graduated transactions. This is not optional busywork: it is explicitly required by the frozen V1.4 reporter spec.

The website and scanner can still observe the lifecycle. The coordinator/signers simply refuse to attest V4 trades until the gate is intentionally enabled.

## 6. Fee economics shown by the site

The VERIFY panel reads live policy where possible. Under the currently validated Pons policy:

- trader normal fee: `5.00%`
- Pons protocol: `0.30%` of normal trade volume
- Boss FeeRouter receives: `4.70%`
- 80% of FeeRouter revenue → chest: `3.76%`
- 20% → project: `0.94%`

The Pons opening anti-snipe tax is displayed separately from the normal fee.

The public chest **never** includes pending/unswept fees. `SETTLED CHEST` is `BossGameTreasury.currentPot()` only.

## 7. Website metadata

Current build:

- Name: `KILL THE BOSS`
- Symbol: `KBOSS`
- Logo URI: `ipfs://bafybeichwf5fc2dgt7dnknkblmftty7citw5v3tjwnfxuv5rbpiaubwcny`

Website/X/Telegram are intentionally blank in `.env.example` until the real URLs exist.

## 8. Before public traffic

Do not open trading to the public until all of these are green:

- frontend tested on desktop + mobile;
- live website reads the deployed Treasury/FeeRouter correctly;
- production domain configured;
- two or three reporter signer services online;
- independent RPCs configured for reporters;
- funded relayer configured;
- direct-wallet + every chosen router/bundler trader-attribution fixtures passed;
- `TRADER_ADAPTER_VERIFIED=true` set on coordinator and all reporter signers;
- `OPERATIONS_ENABLED=true` tested on a fork/staging flow;
- predicted KBOSS address armed before Pons launch;
- Pons launch bound to Treasury immediately after launch;
- backend is already scanning before public traffic;
- V4 fixture gate remains off until graduation testing is completed.

## Important security notes

- Never commit `.env`.
- Never put reporter/private keys in browser code.
- Never use the deployer wallet as a hot backend relayer unless intentionally chosen.
- The website is not authoritative over prize funds or winners.
- The Security Admin / Guardian roles remain separate from reporter keys.
- FeeRouter is ownerless/immutable; the app only calls its permissionless settlement functions.

See `ARCHITECTURE.md` for the data flow and signer model and `docs/V1.1_RELEASE_NOTES.md` for the v1.1 RPC/readiness changes.

## Current readiness boundary

The frontend, live contract reads, demo mode, persistent scanners, fee keeper, reporter coordinator and signer service are implemented. The package intentionally refuses to call itself production-reporting-ready until two launch-dependent items are fixture-tested: **economic trader attribution for the exact trading routes** and **V4 swap reconstruction after graduation**. Those cannot be truthfully completed before KBOSS exists and the actual production trading paths can be exercised. Read-only/live website mode works before launch with no private keys.


## RPC provider compatibility (v1.1.1)

For an Alchemy Free-tier Robinhood Chain endpoint, use:

```dotenv
RPC_POLL_MS=10000
SCAN_CHUNK_BLOCKS=10
RPC_LOG_PAGE_DELAY_MS=75
```

`SCAN_CHUNK_BLOCKS` is used for paged `eth_getLogs` work, including Treasury event catch-up and canonical trade scanning. The application deliberately keeps log ranges small rather than requiring a paid RPC tier. A paid provider can use a larger value later after validation.
