export function normalFeeBreakdown(baseFeeBps:number,creatorTaxBps:number,protocolShareBps:number,treasuryShareBps=8000){
  const protocolVolumeBps=Math.floor(baseFeeBps*protocolShareBps/10_000);
  const creatorBaseVolumeBps=baseFeeBps-protocolVolumeBps;
  const routerVolumeBps=creatorTaxBps+creatorBaseVolumeBps;
  const chestVolumeBps=Math.floor(routerVolumeBps*treasuryShareBps/10_000);
  const projectVolumeBps=routerVolumeBps-chestVolumeBps;
  return {normalTotalBps:baseFeeBps+creatorTaxBps,protocolVolumeBps,creatorBaseVolumeBps,routerVolumeBps,chestVolumeBps,projectVolumeBps};
}
