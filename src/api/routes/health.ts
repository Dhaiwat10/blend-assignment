import { Hono } from 'hono';
import { getVaults, computeVaultHf, getPrices } from '../../services/vaultService';
import { REBALANCE_TRIGGER_HF, TARGET_HEALTH_FACTOR } from '../../config/constants';
import { jsonRespond } from '../utils/respond';
import { formatUnits } from 'viem';
import { TOKENS } from '../../config/tokens';

function statusForHf(hf: number): 'healthy' | 'monitor' | 'breach' | 'liquidatable' {
  if (hf < 1) return 'liquidatable';
  if (hf < REBALANCE_TRIGGER_HF) return 'breach';
  if (hf < TARGET_HEALTH_FACTOR) return 'monitor';
  return 'healthy';
}

export const healthRoute = new Hono();

healthRoute.get('/', (c) => {
  const vaults = getVaults();
  const prices = getPrices();
  const priceSnapshot = Object.fromEntries(
    Object.entries(prices).map(([k, v]) => [k, Math.round(Number(formatUnits(v, 18)) * 100) / 100]),
  );

  const details = vaults.map((v) => {
    const hfWad = computeVaultHf(v);
    const hfNum = Number(Number(formatUnits(hfWad, 18)).toFixed(3));
    return {
      vaultId: v.vaultId,
      collateral: {
        asset: v.collateral.asset,
        amount: formatUnits(v.collateral.amount, TOKENS[v.collateral.asset].decimals),
      },
      debt: {
        asset: v.debt.asset,
        amount: formatUnits(v.debt.amount, TOKENS[v.debt.asset].decimals),
      },
      healthFactor: hfNum,
      status: statusForHf(hfNum),
    };
  });

  const summary = {
    total: details.length,
    healthy: details.filter((d) => d.status === 'healthy').length,
    monitor: details.filter((d) => d.status === 'monitor').length,
    breach: details.filter((d) => d.status === 'breach').length,
    liquidatable: details.filter((d) => d.status === 'liquidatable').length,
  };

  return jsonRespond(c, {
    prices: priceSnapshot,
    summary,
    vaults: details,
  });
});


