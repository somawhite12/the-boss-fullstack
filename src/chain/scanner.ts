import type { PublicClient } from 'viem';
import { config } from '../config.js';
import { BossDb } from '../db.js';
import { resolveBossContext, type BossChainContext } from './context.js';
import { reconstructCanonicalTrades } from './trades.js';
import { discoverLaunchBlock } from './launch.js';

export class TradeScanner {
  private stopped = false;
  private lastContext?: BossChainContext;
  constructor(private client: PublicClient, private db: BossDb, private onChange: () => void) {}

  stop() { this.stopped = true; }
  context() { return this.lastContext; }

  async start() {
    while (!this.stopped) {
      try { await this.tick(); } catch (err) { console.error('[scanner]', err instanceof Error ? err.message : err); }
      await sleep(config.RPC_POLL_MS);
    }
  }

  async tick() {
    const context = await resolveBossContext(this.client);
    if (!context) return;
    this.lastContext = context;
    if (!context.launchExists) return;

    let scanBlock = this.db.getMeta('scan_block');
    if (!scanBlock || this.db.getMeta('scan_token')?.toLowerCase() !== context.token.toLowerCase()) {
      const launchBlock = await discoverLaunchBlock(this.client, context.token);
      this.db.setMeta('scan_token', context.token);
      this.db.setMeta('scan_block', (launchBlock - 1n).toString());
      scanBlock = (launchBlock - 1n).toString();
      console.log(`[scanner] launch discovered at block ${launchBlock}`);
    }

    const latest = await this.client.getBlockNumber();
    let from = BigInt(scanBlock) + 1n;
    while (from <= latest) {
      const to = from + BigInt(config.SCAN_CHUNK_BLOCKS - 1) > latest ? latest : from + BigInt(config.SCAN_CHUNK_BLOCKS - 1);
      const trades = await reconstructCanonicalTrades(this.client, context, from, to);
      let changed = false;
      for (const trade of trades) changed = this.db.insertTrade(trade) || changed;
      this.db.setMeta('scan_block', to.toString());
      if (changed) this.onChange();
      from = to + 1n;
      if (from <= latest && config.RPC_LOG_PAGE_DELAY_MS > 0) await sleep(config.RPC_LOG_PAGE_DELAY_MS);
    }
  }

}

function sleep(ms:number){ return new Promise(r => setTimeout(r, ms)); }
