import 'dotenv/config';
import { z } from 'zod';
import { getAddress, isAddress } from 'viem';
import type { Address } from './shared/types.js';

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  APP_MODE: z.enum(['live', 'demo']).default('live'),
  RPC_HTTP_URL: z.string().url().default('https://rpc.mainnet.chain.robinhood.com'),
  RPC_POLL_MS: z.coerce.number().int().min(500).default(10000),
  RPC_LOG_PAGE_DELAY_MS: z.coerce.number().int().min(0).max(5000).default(75),
  TREASURY_ADDRESS: z.string().default('0x56245Ea05CfDB874e7678C590118C193CAceE049'),
  FEE_ROUTER_ADDRESS: z.string().default('0xC1A6cEb8Ab361E6BFd8B7A61d5536B86235C06F3'),
  PROJECT_RECIPIENT: z.string().default('0x0b397c40ee2b4EF6b91aBF17f3C7DeFc6901D7c7'),
  EXPECTED_PONS_DEPLOYER: z.string().default('0x8aFDeA6c03A0C92f8Ed5EcB2C995E39D38eA0e01'),
  SECURITY_ADMIN: z.string().default('0xe41E8eF10BfeD94B299aED18c43e2Aaa540285B1'),
  GUARDIAN: z.string().default('0xed0a8688DeeB6C975Ab6A5204f50075c5F380E19'),
  REPORTER_A: z.string().default('0x4Dd63079b134C37e8e869b997432920c91bA4BcC'),
  REPORTER_B: z.string().default('0x57d1dfC95e7bE9A1c578C6aAC95E9EA4Fd9CA16c'),
  REPORTER_C: z.string().default('0xd4D6098963C814BfF30410C2E817A84020845662'),
  PONS_FACTORY: z.string().default('0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e'),
  PONS_FEE_ESCROW: z.string().default('0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e'),
  PONS_MEME_HOOK: z.string().default('0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044'),
  PONS_POOL_MANAGER: z.string().default('0x8366a39CC670B4001A1121B8F6A443A643e40951'),
  TOKEN_NAME: z.string().default('KILL THE BOSS'),
  TOKEN_SYMBOL: z.string().default('KBOSS'),
  TOKEN_LOGO_URI: z.string().default('ipfs://bafybeichwf5fc2dgt7dnknkblmftty7citw5v3tjwnfxuv5rbpiaubwcny'),
  TOKEN_DESCRIPTION: z.string().default('Buy to deal damage. Sell to heal the boss. Every trade moves the fight. The wallet that lands the final blow wins the chest. No quests. No points. Just kill the boss.'),
  WEBSITE_URL: z.string().default(''),
  X_URL: z.string().default(''),
  TELEGRAM_URL: z.string().default(''),
  PONS_TRADE_URL: z.string().default(''),
  DB_FILE: z.string().default('./data/boss.sqlite'),
  SCAN_CHUNK_BLOCKS: z.coerce.number().int().min(1).max(5000).default(10),
  LAUNCH_DISCOVERY_LOOKBACK: z.coerce.number().int().min(100).default(12000),
  TOKEN_LAUNCH_BLOCK: z.coerce.number().int().nonnegative().default(0),
  REPORTER_CONFIRMATIONS: z.coerce.number().int().min(5).default(8),
  TRADER_ADAPTER_VERIFIED: z.string().default('false').transform(v => v.toLowerCase() === 'true'),
  V4_REPORTING_ENABLED: z.string().default('false').transform(v => v.toLowerCase() === 'true'),
  MAX_BATCH_SIZE: z.coerce.number().int().min(1).max(64).default(64),
  BATCH_DEADLINE_SECONDS: z.coerce.number().int().min(60).max(1800).default(600),
  OPERATIONS_ENABLED: z.string().default('false').transform(v => v.toLowerCase() === 'true'),
  RELAYER_PRIVATE_KEY: z.string().default(''),
  REPORTER_SIGNER_URLS: z.string().default(''),
  REPORTER_SIGNER_TIMEOUT_MS: z.coerce.number().int().min(1000).default(10000),
  REPORTER_SIGNER_AUTH_TOKEN: z.string().default(''),
  SIGNER_HOST: z.string().default('127.0.0.1'),
  SIGNER_PORT: z.coerce.number().int().positive().default(4101),
  SIGNER_RPC_URL: z.string().default(''),
  REPORTER_PRIVATE_KEY: z.string().default(''),
  SIGNER_MAX_DEADLINE_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  DEMO_CONTROLS: z.string().default('true').transform(v => v.toLowerCase() === 'true'),
});

const e = schema.parse(process.env);
function addr(v: string, name: string): Address {
  if (!isAddress(v)) throw new Error(`${name} is not a valid EVM address`);
  return getAddress(v) as Address;
}

export const config = {
  ...e,
  TREASURY_ADDRESS: addr(e.TREASURY_ADDRESS, 'TREASURY_ADDRESS'),
  FEE_ROUTER_ADDRESS: addr(e.FEE_ROUTER_ADDRESS, 'FEE_ROUTER_ADDRESS'),
  PROJECT_RECIPIENT: addr(e.PROJECT_RECIPIENT, 'PROJECT_RECIPIENT'),
  EXPECTED_PONS_DEPLOYER: addr(e.EXPECTED_PONS_DEPLOYER, 'EXPECTED_PONS_DEPLOYER'),
  SECURITY_ADMIN: addr(e.SECURITY_ADMIN, 'SECURITY_ADMIN'),
  GUARDIAN: addr(e.GUARDIAN, 'GUARDIAN'),
  REPORTER_A: addr(e.REPORTER_A, 'REPORTER_A'),
  REPORTER_B: addr(e.REPORTER_B, 'REPORTER_B'),
  REPORTER_C: addr(e.REPORTER_C, 'REPORTER_C'),
  PONS_FACTORY: addr(e.PONS_FACTORY, 'PONS_FACTORY'),
  PONS_FEE_ESCROW: addr(e.PONS_FEE_ESCROW, 'PONS_FEE_ESCROW'),
  PONS_MEME_HOOK: addr(e.PONS_MEME_HOOK, 'PONS_MEME_HOOK'),
  PONS_POOL_MANAGER: addr(e.PONS_POOL_MANAGER, 'PONS_POOL_MANAGER'),
  REPORTER_SIGNER_URLS: e.REPORTER_SIGNER_URLS.split(',').map(s => s.trim()).filter(Boolean),
};

export function validateOperationsConfig() {
  if (!config.OPERATIONS_ENABLED) return;
  if (config.APP_MODE !== 'live') throw new Error('OPERATIONS_ENABLED requires APP_MODE=live');
  if (!/^0x[0-9a-fA-F]{64}$/.test(config.RELAYER_PRIVATE_KEY)) {
    throw new Error('RELAYER_PRIVATE_KEY must be configured as a secret when OPERATIONS_ENABLED=true');
  }
  if (config.REPORTER_SIGNER_URLS.length < 2) {
    throw new Error('At least two REPORTER_SIGNER_URLS are required when operations are enabled');
  }
  if (!config.TRADER_ADAPTER_VERIFIED) {
    throw new Error('TRADER_ADAPTER_VERIFIED=true is required before operations can attest trades');
  }
}
