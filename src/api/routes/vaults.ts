import { Hono } from 'hono';
import { getPrices, getVaultById, getVaults } from '../../services/vaultService';
import { computeHealthFactor } from '../../utils/health';
import { LIQUIDATION_THRESHOLD } from '../../config/constants';
import { resolvePriceSymbol, TOKENS } from '../../config/tokens';
import { toUsd, baseToHumanWad, wadMul, WAD } from '../../utils/math';
import { jsonRespond } from '../utils/respond';

// Read-only endpoints exposing the current vault snapshot and HF.
export const vaultsRoute = new Hono();

vaultsRoute.get('/', (c) => {
  const prices = getPrices();
  const data = getVaults().map((v) => {
    const Pc = prices[resolvePriceSymbol(v.collateral.asset)];
    const Pd = prices[resolvePriceSymbol(v.debt.asset)];
    const hfWad = computeHealthFactor({ vault: v, prices, liquidationThreshold: LIQUIDATION_THRESHOLD });
    const cDec = TOKENS[v.collateral.asset].decimals;
    const dDec = TOKENS[v.debt.asset].decimals;
    const collateralUsd = toUsd(wadMul(baseToHumanWad(v.collateral.amount, cDec), Pc));
    const debtUsd = toUsd(wadMul(baseToHumanWad(v.debt.amount, dDec), Pd));
    return {
      ...v,
      valuations: { collateralUsd, debtUsd },
      healthFactor: Number((Number(hfWad) / Number(WAD)).toFixed(4)),
    };
  });
  return jsonRespond(c, data);
});

vaultsRoute.get('/:id', (c) => {
  const id = c.req.param('id');
  const v = getVaultById(id);
  if (!v) return jsonRespond(c, { error: 'Not found' }, 404);
  const prices = getPrices();
  const Pc = prices[resolvePriceSymbol(v.collateral.asset)];
  const Pd = prices[resolvePriceSymbol(v.debt.asset)];
  const cDec = TOKENS[v.collateral.asset].decimals;
  const dDec = TOKENS[v.debt.asset].decimals;
  const hfWad = computeHealthFactor({ vault: v, prices, liquidationThreshold: LIQUIDATION_THRESHOLD });
  return jsonRespond(c, {
    ...v,
    valuations: {
      collateralUsd: toUsd(wadMul(baseToHumanWad(v.collateral.amount, cDec), Pc)),
      debtUsd: toUsd(wadMul(baseToHumanWad(v.debt.amount, dDec), Pd)),
    },
    healthFactor: Number((Number(hfWad) / Number(WAD)).toFixed(4)),
  });
});


