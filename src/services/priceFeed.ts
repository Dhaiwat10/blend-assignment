import { getPrices, setPrices } from './vaultService';
import { WAD, wadMul, toWad } from '../utils/math';
import { formatUnits } from 'viem';

// Immutable description of a single crash tick. Returned to callers and logged.
export type CrashTick = {
  at: string;
  changed: { symbol: string; old: number; new: number; dropPct: number };
};

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

// Apply one price drop to either wstETH or weETH and return the delta for logging.
// The symbol can be forced for deterministic tests.
export function applyCrashTick(forceSymbol?: 'wstETH' | 'weETH'): CrashTick {
  const prices = getPrices();
  const targetSymbol = forceSymbol ?? randomChoice(['wstETH', 'weETH']);
  const current = prices[targetSymbol];
  // drop factor: 1 - r where r in [0.05, 0.15]
  const r = toWad(randomBetween(0.05, 0.15));
  const dropFactor = WAD - r;
  const next = wadMul(current, dropFactor);
  const nextPrices = { ...prices, [targetSymbol]: next };
  // best-effort persist; callers don't need to await persistence
  void setPrices(nextPrices);
  return {
    at: new Date().toISOString(),
    changed: {
      symbol: targetSymbol,
      old: Math.round(Number(formatUnits(current, 18)) * 100) / 100,
      new: Math.round(Number(formatUnits(next, 18)) * 100) / 100,
      dropPct: Math.round(Number(formatUnits(WAD - dropFactor, 18)) * 10000) / 100,
    },
  };
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomTickDelayMs(): number {
  return Math.floor(randomBetween(2000, 3000));
}


