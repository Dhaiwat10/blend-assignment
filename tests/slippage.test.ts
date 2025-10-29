import { test, expect } from 'bun:test';
import { generateExecutionPlan } from '../src/services/rebalanceEngine';
import type { PriceMap, Vault } from '../src/domain/types';
import { parseUnits } from 'viem';

const prices: PriceMap = {
  wstETH: parseUnits('2000', 18),
  weETH: parseUnits('3000', 18),
  USDC: parseUnits('1', 18),
  WETH: parseUnits('3500', 18),
  bUSDC: parseUnits('1', 18),
  bETH: parseUnits('3500', 18),
};

test('Swap minAmount reflects 50 bps slippage', () => {
  const vault: Vault = {
    vaultId: 'VAULT-A-WSTETH-BUSDC',
    collateral: { asset: 'wstETH', amount: parseUnits('10', 18) },
    debt: { asset: 'bUSDC', amount: parseUnits('15000', 6) },
  };

  const plan = generateExecutionPlan({ vault, prices, slippageBps: 50 });
  const swap = plan.actions.find((a) => a.type === 'swap');
  expect(swap).toBeTruthy();
  const expected = Number((Number(swap!.expectedAmount) * 0.995).toFixed(6));
  const minAmount = Number(Number(swap!.minAmount).toFixed(6));
  expect(minAmount).toBeCloseTo(expected, 6);
});


