import { test, expect } from 'bun:test';
import { computeCollateralToSell } from '../src/services/rebalanceEngine';
import type { PriceMap, Vault } from '../src/domain/types';
import { parseUnits, formatUnits } from 'viem';

const prices: PriceMap = {
  wstETH: parseUnits('2000', 18), // crashed collateral price
  weETH: parseUnits('3600', 18),
  USDC: parseUnits('1', 18),
  WETH: parseUnits('3550', 18),
  bUSDC: parseUnits('1', 18),
  bETH: parseUnits('3550', 18),
};

test('Rebalance brings HF close to 1.25', () => {
  const vault: Vault = {
    vaultId: 'VAULT-A-WSTETH-BUSDC',
    collateral: { asset: 'wstETH', amount: parseUnits('10', 18) },
    debt: { asset: 'bUSDC', amount: parseUnits('15000', 6) },
  };

  const { sellAmountBase, projected } = computeCollateralToSell({
    vault,
    prices,
    targetHealthFactor: 1.25,
    liquidationThreshold: 0.85,
    slippageBps: 50,
  });

  expect(sellAmountBase > 0n).toBeTrue();
  // projected.newHfWad is WAD-scaled
  expect(Number(Number(formatUnits(projected.newHfWad, 18)).toFixed(2))).toBeCloseTo(1.25, 2);
});


