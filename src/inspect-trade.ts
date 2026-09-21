import { decodeEventLog } from 'viem';
import { publicClient } from './chain/client.js';
import { config } from './config.js';
import { curveBuyEvent, curveSellEvent, v4SwapEvent } from './chain/abis.js';
import { resolveBossContext } from './chain/context.js';

const hash = process.argv[2] as `0x${string}` | undefined;
if (!hash || !/^0x[0-9a-fA-F]{64}$/.test(hash)) {
  throw new Error('Usage: npm run inspect:tx -- 0x<transactionHash>');
}

const [tx, receipt, context] = await Promise.all([
  publicClient.getTransaction({ hash }),
  publicClient.getTransactionReceipt({ hash }),
  resolveBossContext(publicClient),
]);

const events:any[] = [];
for (const log of receipt.logs) {
  if (context && log.address.toLowerCase() === context.curve.toLowerCase()) {
    for (const event of [curveBuyEvent, curveSellEvent]) {
      try {
        const decoded:any = decodeEventLog({ abi:[event], data:log.data, topics:log.topics });
        events.push({
          venue:'curve', event:decoded.eventName, logIndex:Number(log.logIndex),
          actor:decoded.eventName === 'CurveBuy' ? decoded.args.buyer : decoded.args.seller,
          recipient:decoded.args.recipient,
          quoteAmount:(decoded.eventName === 'CurveBuy' ? decoded.args.quoteIn : decoded.args.quoteOut).toString(),
        });
        break;
      } catch { /* not this event */ }
    }
  }
  if (context && log.address.toLowerCase() === config.PONS_POOL_MANAGER.toLowerCase()) {
    try {
      const decoded:any = decodeEventLog({ abi:[v4SwapEvent], data:log.data, topics:log.topics });
      if (String(decoded.args.id).toLowerCase() === context.computedPoolId.toLowerCase()) {
        events.push({
          venue:'v4', event:'Swap', logIndex:Number(log.logIndex), sender:decoded.args.sender,
          amount0:decoded.args.amount0.toString(), amount1:decoded.args.amount1.toString(), poolId:decoded.args.id,
        });
      }
    } catch { /* unrelated PoolManager event */ }
  }
}

console.log(JSON.stringify({
  txHash:hash,
  txFrom:tx.from,
  txTo:tx.to,
  status:receipt.status,
  blockNumber:receipt.blockNumber.toString(),
  transactionIndex:Number(receipt.transactionIndex),
  currentContext:context ? {
    token:context.token, curve:context.curve, phase:context.phase,
    computedPoolId:context.computedPoolId, boundPoolId:context.boundPoolId,
  } : null,
  events,
  note:'Compare txFrom/event actor/recipient against the wallet that economically initiated the trade. Add this tx as a fixture before setting TRADER_ADAPTER_VERIFIED=true.',
}, null, 2));
