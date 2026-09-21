import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import type { CanonicalTrade, FeedItem, Hex } from './shared/types.js';

export class BossDb {
  readonly db: DatabaseSync;
  constructor(file = config.DB_FILE) {
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY,
        block_number TEXT NOT NULL,
        tx_index INTEGER NOT NULL,
        log_index INTEGER NOT NULL,
        tx_hash TEXT NOT NULL,
        trader TEXT NOT NULL,
        quote_wei TEXT NOT NULL,
        venue INTEGER NOT NULL,
        source_id TEXT NOT NULL,
        is_buy INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'detected',
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS trades_position ON trades(CAST(block_number AS INTEGER), tx_index, log_index);
      CREATE TABLE IF NOT EXISTS feed (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        tx_hash TEXT,
        trader TEXT,
        quote_wei TEXT,
        block_number TEXT,
        provisional INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS feed_created ON feed(created_at DESC);
      CREATE TABLE IF NOT EXISTS batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tx_hash TEXT,
        first_trade TEXT NOT NULL,
        last_trade TEXT NOT NULL,
        trade_count INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
  }

  getMeta(key: string) { return (this.db.prepare('SELECT value FROM meta WHERE key=?').get(key) as {value:string}|undefined)?.value; }
  setMeta(key: string, value: string) { this.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value); }

  insertTrade(t: CanonicalTrade) {
    const id = `${t.txHash.toLowerCase()}:${t.logIndex}`;
    const result = this.db.prepare(`INSERT OR IGNORE INTO trades
      (id,block_number,tx_index,log_index,tx_hash,trader,quote_wei,venue,source_id,is_buy,status,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, t.blockNumber.toString(), t.transactionIndex, t.logIndex, t.txHash, t.trader,
        t.quoteAmount.toString(), t.venue, t.sourceId, t.isBuy ? 1 : 0, 'detected', Date.now()
      );
    if (Number(result.changes) > 0) {
      const eth = Number(t.quoteAmount) / 1e18;
      this.addFeed({
        id: `detected:${id}`,
        type: t.isBuy ? 'buy' : 'sell',
        message: t.isBuy ? `${short(t.trader)} dealt ${fmtEth(eth)} ETH of damage` : `${short(t.trader)} healed the Boss with ${fmtEth(eth)} ETH`,
        txHash: t.txHash,
        trader: t.trader,
        quoteWei: t.quoteAmount.toString(),
        blockNumber: t.blockNumber.toString(),
        provisional: true,
        createdAt: Date.now(),
      });
      return true;
    }
    return false;
  }

  pendingTrades(limit = 64): CanonicalTrade[] {
    const rows = this.db.prepare(`SELECT * FROM trades WHERE status='detected'
      ORDER BY CAST(block_number AS INTEGER), tx_index, log_index LIMIT ?`).all(limit) as any[];
    return rows.map(rowToTrade);
  }

  pendingTradesThroughBlock(block: bigint, limit = 64): CanonicalTrade[] {
    const rows = this.db.prepare(`SELECT * FROM trades WHERE status='detected' AND CAST(block_number AS INTEGER) <= ?
      ORDER BY CAST(block_number AS INTEGER), tx_index, log_index LIMIT ?`).all(Number(block), limit) as any[];
    return rows.map(rowToTrade);
  }

  confirmTradeEvent(txHash: Hex, originalLogIndex: number, isBuy: boolean, trader: string, quoteWei: bigint, blockNumber: bigint) {
    const id = `${txHash.toLowerCase()}:${originalLogIndex}`;
    this.db.prepare("UPDATE trades SET status='confirmed' WHERE id=?").run(id);
    const existing = this.db.prepare('SELECT id FROM feed WHERE id=?').get(`detected:${id}`) as {id:string}|undefined;
    if (existing) {
      this.db.prepare('UPDATE feed SET provisional=0 WHERE id=?').run(`detected:${id}`);
    } else {
      const amount = Number(quoteWei) / 1e18;
      this.addFeed({
        id:`confirmed:${id}`,
        type:isBuy?'buy':'sell',
        message:isBuy?`${short(trader)} dealt ${fmtEth(amount)} ETH of damage`:`${short(trader)} healed the Boss with ${fmtEth(amount)} ETH`,
        txHash,trader:trader as any,quoteWei:quoteWei.toString(),blockNumber:blockNumber.toString(),provisional:false,createdAt:Date.now()
      });
    }
  }

  markConfirmed(trades: CanonicalTrade[]) {
    const stmt = this.db.prepare("UPDATE trades SET status='confirmed' WHERE id=?");
    for (const t of trades) {
      const id = `${t.txHash.toLowerCase()}:${t.logIndex}`;
      stmt.run(id);
      this.db.prepare('UPDATE feed SET provisional=0 WHERE id=?').run(`detected:${id}`);
    }
    this.db.prepare("UPDATE feed SET provisional=0 WHERE provisional=1 AND substr(id,10) IN (SELECT id FROM trades WHERE status='confirmed')").run();
  }

  markThroughCursorConfirmed(block: bigint, txIndex: number, logIndex: number) {
    this.db.prepare(`UPDATE trades SET status='confirmed' WHERE status='detected' AND (
      CAST(block_number AS INTEGER) < ? OR
      (CAST(block_number AS INTEGER) = ? AND tx_index < ?) OR
      (CAST(block_number AS INTEGER) = ? AND tx_index = ? AND log_index <= ?)
    )`).run(Number(block), Number(block), txIndex, Number(block), txIndex, logIndex);
    this.db.prepare("UPDATE feed SET provisional=0 WHERE provisional=1 AND substr(id,10) IN (SELECT id FROM trades WHERE status='confirmed')").run();
  }

  addFeed(item: FeedItem) {
    this.db.prepare(`INSERT OR REPLACE INTO feed(id,type,message,tx_hash,trader,quote_wei,block_number,provisional,created_at)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(item.id,item.type,item.message,item.txHash ?? null,item.trader ?? null,item.quoteWei ?? null,item.blockNumber ?? null,item.provisional ? 1 : 0,item.createdAt);
    this.db.prepare(`DELETE FROM feed WHERE id NOT IN (SELECT id FROM feed ORDER BY created_at DESC LIMIT 160)`).run();
  }

  feed(limit = 60): FeedItem[] {
    const rows = this.db.prepare('SELECT * FROM feed ORDER BY created_at DESC LIMIT ?').all(limit) as any[];
    return rows.map(r => ({
      id:r.id,type:r.type,message:r.message,txHash:r.tx_hash ?? undefined,trader:r.trader ?? undefined,
      quoteWei:r.quote_wei ?? undefined,blockNumber:r.block_number ?? undefined,provisional:Boolean(r.provisional),createdAt:r.created_at
    }));
  }

  recordBatch(first: CanonicalTrade, last: CanonicalTrade, count: number, status: string, txHash?: Hex) {
    this.db.prepare('INSERT INTO batches(tx_hash,first_trade,last_trade,trade_count,status,created_at) VALUES(?,?,?,?,?,?)')
      .run(txHash ?? null, `${first.txHash}:${first.logIndex}`, `${last.txHash}:${last.logIndex}`, count, status, Date.now());
  }
}

function rowToTrade(r:any): CanonicalTrade {
  return {
    blockNumber: BigInt(r.block_number), transactionIndex:r.tx_index, logIndex:r.log_index,
    txHash:r.tx_hash, trader:r.trader, quoteAmount:BigInt(r.quote_wei), venue:r.venue,
    sourceId:r.source_id, isBuy:Boolean(r.is_buy)
  };
}
function short(a:string){ return `${a.slice(0,6)}…${a.slice(-4)}`; }
function fmtEth(n:number){ if(n>=1)return n.toFixed(2); if(n>=0.01)return n.toFixed(3); return n.toFixed(4); }
