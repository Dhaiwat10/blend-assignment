import { test, expect } from 'bun:test';
import { computeHealthFactor } from '../src/utils/health';
import type { PriceMap, Vault } from '../src/domain/types';
import { parseUnits, formatUnits } from 'viem';

const prices: PriceMap = {
  wstETH: parseUnits('3500', 18),
  weETH: parseUnits('3600', 18),
  USDC: parseUnits('1', 18),
  WETH: parseUnits('3550', 18),
  bUSDC: parseUnits('1', 18),
  bETH: parseUnits('3550', 18),
};

test('HF baseline for Vault A > 1', () => {
  const vault: Vault = {
    vaultId: 'VAULT-A-WSTETH-BUSDC',
    collateral: { asset: 'wstETH', amount: parseUnits('10', 18) },
    debt: { asset: 'bUSDC', amount: parseUnits('15000', 6) },
  };
  const hf = computeHealthFactor({ vault, prices, liquidationThreshold: 0.85 });
  expect(Number(Number(formatUnits(hf, 18)).toFixed(3))).toBeCloseTo(1.983, 3);
});

test('HF baseline for Vault B around 0.86', () => {
  const vault: Vault = {
    vaultId: 'VAULT-B-WEETH-BETH',
    collateral: { asset: 'weETH', amount: parseUnits('5', 18) },
    debt: { asset: 'bETH', amount: parseUnits('5', 18) },
  };
  const hf = computeHealthFactor({ vault, prices, liquidationThreshold: 0.85 });
  expect(Number(Number(formatUnits(hf, 18)).toFixed(3))).toBeCloseTo(0.862, 3);
});

test('HF drops below 1.15 after a large price crash for Vault A', () => {
  const crashPrices: PriceMap = { ...prices, wstETH: parseUnits('1700', 18) };
  const vault: Vault = {
    vaultId: 'VAULT-A-WSTETH-BUSDC',
    collateral: { asset: 'wstETH', amount: parseUnits('10', 18) },
    debt: { asset: 'bUSDC', amount: parseUnits('15000', 6) },
  };
  const hf = computeHealthFactor({ vault, prices: crashPrices, liquidationThreshold: 0.85 });
  expect(Number(Number(formatUnits(hf, 18)).toFixed(3))).toBeLessThan(1.15);
});


