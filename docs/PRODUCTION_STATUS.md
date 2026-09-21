# Production status — 2026-09-21

## Live on Robinhood Chain

- BossGameTreasury: `0x56245Ea05CfDB874e7678C590118C193CAceE049`
- BossFeeRouter: `0xC1A6cEb8Ab361E6BFd8B7A61d5536B86235C06F3`
- Pons V2 factory: `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e`
- Pons fee escrow: `0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e`
- Pons meme hook: `0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044`
- Pons PoolManager: `0x8366a39CC670B4001A1121B8F6A443A643e40951`

The Treasury/FeeRouter wiring was checked immediately after deployment. Boss #1 starts at 2,000,000 HP and `hpPerEth = 1,000,000`.


## Local validation completed

The v1.0.1 package was run locally against Robinhood Chain before the v1.1 RPC update:

- `npm run check`: passed.
- `npm run build`: passed.
- `npm run smoke`: passed with `deployment.ok = true`, Boss #1 at `2,000,000 / 2,000,000` HP, zero settled pot and zero known pending routing.
- `npm run dev`: live pre-launch UI rendered the expected on-chain state.
- The public Robinhood RPC then produced `Too Many Requests` during concurrent dashboard reads. v1.1 adds Multicall3 batching and changes the safe default polling interval to 10 seconds.

The public RPC remains suitable for development/read-only checks but should not be treated as production infrastructure. Configure a dedicated `RPC_HTTP_URL` before public traffic, and keep reporter signers on independent RPC providers.

## Not launched

KBOSS does not exist yet. No Pons token launch has happened. Current intended metadata:

- Name: `KILL THE BOSS`
- Symbol: `KBOSS`
- Logo: `ipfs://bafybeichwf5fc2dgt7dnknkblmftty7citw5v3tjwnfxuv5rbpiaubwcny`

## Required before public trading

1. Re-run v1.1 validation (`check`, `build`, `smoke`, `dev`), confirm stable RPC behavior, finish desktop/mobile checks and set real domain/social URLs.
2. Predict KBOSS address and arm it in BossGameTreasury before Pons launch.
3. Launch via the intended Pons launcher flow with BossFeeRouter as creator recipient, 4% creator tax, native ETH pair, buyback disabled and pinned launch economics.
4. Bind launch immediately and verify the live launch record.
5. Fixture-test economic trader attribution for every actual trading route; then set `TRADER_ADAPTER_VERIFIED=true`.
6. Run two or three independent reporter signers plus funded relayer and test the complete keeper/reporter path before public traffic.
7. Keep `V4_REPORTING_ENABLED=false` until real graduated Pons V4 swaps have been fixture-tested.

The app is deliberately safe by default: `OPERATIONS_ENABLED=false`, `TRADER_ADAPTER_VERIFIED=false`, and `V4_REPORTING_ENABLED=false`.
