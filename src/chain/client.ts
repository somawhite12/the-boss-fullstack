import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { config } from '../config.js';
import { robinhoodChain } from './constants.js';

export const publicClient = createPublicClient({
  chain: robinhoodChain,
  batch: {
    multicall: {
      wait: 25,
    },
  },
  pollingInterval: config.RPC_POLL_MS,
  transport: http(config.RPC_HTTP_URL, { timeout: 15_000, retryCount: 2 }),
});

export function makePublicClient(url: string) {
  return createPublicClient({
    chain: robinhoodChain,
    transport: http(url, { timeout: 15_000, retryCount: 2 }),
  });
}

export function makeRelayer() {
  if (!/^0x[0-9a-fA-F]{64}$/.test(config.RELAYER_PRIVATE_KEY)) {
    throw new Error('RELAYER_PRIVATE_KEY is not configured');
  }
  const account = privateKeyToAccount(config.RELAYER_PRIVATE_KEY as `0x${string}`);
  const walletClient = createWalletClient({ account, chain: robinhoodChain, transport: http(config.RPC_HTTP_URL) });
  return { account, walletClient };
}
