import type { PriceMap, Vault } from '../domain/types';
import { resolvePriceSymbol, TOKENS } from '../config/tokens';
import { WAD, baseToHumanWad, wadMul, wadDiv, toWad } from './math';

// Compute HF (WAD) = (Collateral * Pc * L) / (Debt * Pd)
// Prices are looked up by their underlying symbols for loan tokens (e.g., bETH -> WETH).
export function computeHealthFactor(params: {
  vault: Vault;
  prices: PriceMap;
  liquidationThreshold: number | bigint;
}): bigint {
  const { vault, prices } = params;
  const L = typeof params.liquidationThreshold === 'bigint' ? params.liquidationThreshold : toWad(params.liquidationThreshold);

  const Pc = prices[resolvePriceSymbol(vault.collateral.asset)]; // USD per token (WAD)
  const Pd = prices[resolvePriceSymbol(vault.debt.asset)]; // USD per token (WAD)
  if (Pc === undefined || Pd === undefined) throw new Error('Missing price for asset');

  const cDec = TOKENS[vault.collateral.asset].decimals;
  const dDec = TOKENS[vault.debt.asset].decimals;

  const Cw = baseToHumanWad(vault.collateral.amount, cDec);
  const Dw = baseToHumanWad(vault.debt.amount, dDec);

  const collateralUsdWad = wadMul(Cw, Pc);
  const debtUsdWad = wadMul(Dw, Pd);
  if (debtUsdWad === 0n) return BigInt(2) ** BigInt(255); // effectively infinity

  const num = wadMul(collateralUsdWad, L);
  const hf = wadDiv(num, debtUsdWad);
  return hf;
}


