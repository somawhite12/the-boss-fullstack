import { parseAbi, parseAbiItem } from 'viem';

export const treasuryAbi = parseAbi([
  'function ponsFactory() view returns (address)',
  'function expectedPonsDeployer() view returns (address)',
  'function securityAdmin() view returns (address)',
  'function guardian() view returns (address)',
  'function expectedProjectRecipient() view returns (address)',
  'function expectedToken() view returns (address)',
  'function launchToken() view returns (address)',
  'function bondingCurve() view returns (address)',
  'function feeRouter() view returns (address)',
  'function v4PoolId() view returns (bytes32)',
  'function roundId() view returns (uint64)',
  'function currentHp() view returns (uint128)',
  'function currentBossMaxHp() view returns (uint128)',
  'function hpPerEth() view returns (uint128)',
  'function maxHp() view returns (uint128)',
  'function currentPot() view returns (uint256)',
  'function reservedClaims() view returns (uint256)',
  'function totalTradesApplied() view returns (uint256)',
  'function totalBossesDefeated() view returns (uint256)',
  'function reportingPaused() view returns (bool)',
  'function migrated() view returns (bool)',
  'function batchNonce() view returns (uint256)',
  'function reporterSetVersion() view returns (uint64)',
  'function tradeChainHash() view returns (bytes32)',
  'function lastBlockNumber() view returns (uint64)',
  'function lastTransactionIndex() view returns (uint32)',
  'function lastLogIndex() view returns (uint32)',
  'function reporters(uint256) view returns (address)',
  'function isReporter(address) view returns (bool)',
  'function claimable(address) view returns (uint256)',
  'function bindLaunch()',
  'function bindV4Pool(bytes32 poolId)',
  'function submitTradeBatch((uint64 blockNumber,uint32 transactionIndex,uint32 logIndex,bytes32 txHash,address trader,uint96 quoteAmount,uint8 venue,bytes32 sourceId,bool isBuy)[] trades,uint256 deadline,bytes[] signatures)',
  'function batchDigest((uint64 blockNumber,uint32 transactionIndex,uint32 logIndex,bytes32 txHash,address trader,uint96 quoteAmount,uint8 venue,bytes32 sourceId,bool isBuy)[] trades,uint256 deadline) view returns (bytes32)',
  'event TradeApplied(uint64 indexed roundId, bytes32 indexed txHash, address indexed trader, bool isBuy, uint8 venue, uint256 quoteAmount, uint256 hpDelta, uint256 hpAfter, uint64 blockNumber, uint32 transactionIndex, uint32 logIndex, bytes32 chainHashAfter)',
  'event BossDefeated(uint64 indexed roundId, address indexed winner, uint256 prize, bytes32 indexed txHash, uint64 blockNumber, uint32 transactionIndex, uint32 logIndex, uint256 overkillHp)',
  'event BossStarted(uint64 indexed roundId, uint256 maxHp)',
  'event PrizeClaimed(address indexed winner,address indexed recipient,uint256 amount)',
  'event ExpectedTokenArmed(address indexed token)',
  'event LaunchBound(address indexed token,address indexed curve,address indexed feeRouter,address ponsDeployer)',
  'event V4PoolBound(bytes32 indexed poolId,address indexed token)'
]);

export const feeRouterAbi = parseAbi([
  'function ponsFactory() view returns (address)',
  'function ponsFeeEscrow() view returns (address)',
  'function treasury() view returns (address)',
  'function projectRecipient() view returns (address)',
  'function TREASURY_BPS() view returns (uint256)',
  'function PROJECT_BPS() view returns (uint256)',
  'function treasuryAccrued() view returns (uint256)',
  'function projectAccrued() view returns (uint256)',
  'function accounting() view returns (uint256 balance,uint256 liabilities,uint256 unallocatedSurplus)',
  'function sweepCurveFees(address token)',
  'function sweepPoolFees(bytes32 poolId)',
  'function harvest() returns (uint256 claimed,uint256 allocated)',
  'function releaseTreasury() returns (uint256 amount)',
  'function releaseProject() returns (uint256 amount)',
  'event CurveSweepTriggered(address indexed caller,address indexed token,address indexed curve)',
  'event PoolSweepTriggered(address indexed caller,bytes32 indexed poolId)',
  'event EscrowHarvested(address indexed caller,uint256 amount)',
  'event RevenueAllocated(address indexed caller,uint256 grossAmount,uint256 treasuryAmount,uint256 projectAmount)',
  'event TreasuryReleased(address indexed caller,address indexed treasury,uint256 amount)',
  'event ProjectReleased(address indexed caller,address indexed projectRecipient,uint256 amount)'
]);

export const feeEscrowAbi = parseAbi([
  'function balanceOf(address recipient) view returns (uint256)'
]);

export const curveAbi = parseAbi([
  'function feeBps() view returns (uint256)',
  'function creatorTaxBps() view returns (uint256)',
  'function quoteFeeBalance() view returns (uint256)',
  'function creatorTaxBalance() view returns (uint256)'
]);

export const ponsFactoryAbi = parseAbi([
  'struct FeePolicySnapshot { address protocolFeeRecipient; uint16 protocolFeeShareBps; uint16 buybackBurnBps; uint16 hookFeeBps; uint16 maxInternalPriceImpactBps; }',
  'struct LaunchedToken { address token; address curve; address deployer; address creatorFeeRecipient; address pairToken; uint256 graduationThreshold; uint24 poolFee; int24 tickSpacing; uint16 creatorTaxBps; bool buybackEnabled; uint8 phase; uint256 sweptQuote; uint256 sweptTokens; uint256 sweptAt; bool exists; }',
  'function getLaunchedToken(address token) view returns (LaunchedToken)',
  'function getLaunchFeePolicy(address token) view returns (FeePolicySnapshot)',
  'function pendingCreatorFeeRecipient(address token) view returns (address newRecipient,uint256 effectiveAt,uint256 expiresAt)',
  'function snipeTaxStartBps() view returns (uint256)',
  'function snipeTaxSeconds() view returns (uint256)',
  'function maxCreatorTaxBps() view returns (uint256)',
  'function launchFee() view returns (uint256)',
  'event TokenLaunched(address indexed token,address indexed curve,address indexed deployer,address pairToken,uint256 launchConfigId,uint256 graduationThreshold)'
]);

export const memeHookAbi = parseAbi([
  'function protocolFeeShareBps() view returns (uint256)',
  'function hookFeeBps() view returns (uint256)',
  'function buybackBurnBps() view returns (uint256)',
  'function maxInternalPriceImpactBps() view returns (uint256)'
]);

export const curveBuyEvent = parseAbiItem(
  'event CurveBuy(address indexed buyer,address indexed recipient,uint256 quoteIn,uint256 tokensOut,uint256 fee,uint256 tax)'
);
export const curveSellEvent = parseAbiItem(
  'event CurveSell(address indexed seller,address indexed recipient,uint256 tokensIn,uint256 quoteOut,uint256 fee,uint256 tax)'
);
export const v4SwapEvent = parseAbiItem(
  'event Swap(bytes32 indexed id,address indexed sender,int128 amount0,int128 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick,uint24 fee)'
);
export const tokenLaunchedEvent = parseAbiItem(
  'event TokenLaunched(address indexed token,address indexed curve,address indexed deployer,address pairToken,uint256 launchConfigId,uint256 graduationThreshold)'
);
