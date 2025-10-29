import { formatUnits, parseUnits } from 'viem';

export const WAD: bigint = 10n ** 18n;

export function pow10(n: number): bigint { return 10n ** BigInt(n); }

// Convert number|string to WAD-scaled bigint (use string when possible for precision)
export function toWad(value: number | string | bigint): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return parseUnits(value.toString(), 18);
  return parseUnits(value, 18);
}

export function fromWad(wad: bigint): string {
  return formatUnits(wad, 18);
}

export function bpsToWad(bps: number): bigint {
  return (BigInt(bps) * WAD) / 10_000n;
}

export function clampBigInt(x: bigint, min: bigint, max: bigint): bigint {
  if (x < min) return min;
  if (x > max) return max;
  return x;
}

export function mulDiv(a: bigint, b: bigint, denominator: bigint): bigint {
  return (a * b) / denominator;
}

export function wadMul(aWad: bigint, bWad: bigint): bigint {
  return mulDiv(aWad, bWad, WAD);
}

export function wadDiv(aWad: bigint, bWad: bigint): bigint {
  return mulDiv(aWad, WAD, bWad);
}

export function baseToHumanWad(base: bigint, decimals: number): bigint {
  return mulDiv(base, WAD, pow10(decimals));
}

export function humanWadToBase(humanWad: bigint, decimals: number): bigint {
  return mulDiv(humanWad, pow10(decimals), WAD);
}

export function toUsd(usdWad: bigint): number {
  // return as number with 2 decimals for display
  const s = formatUnits(usdWad, 18);
  const n = Number(s);
  return Math.round(n * 100) / 100;
}

export function displayAmountBase(amountBase: bigint, symbol: string, decimals: number): string {
  const isUsdLike = symbol === 'USDC' || symbol === 'bUSDC';
  const dp = isUsdLike ? 2 : 4;
  const s = Number(formatUnits(amountBase, decimals)).toFixed(dp);
  return `${s} ${symbol}`;
}

