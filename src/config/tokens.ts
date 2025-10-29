import { parseUnits } from 'viem';
import type { TokenMeta, PriceMap } from '../domain/types';

// Minimal token registry with addresses/decimals used for encoding and display.
export const TOKENS: Record<string, TokenMeta> = {
  wstETH: {
    symbol: 'wstETH',
    name: 'Wrapped Liquid Staked Ether',
    address: '0xc1cba3fcea344f02d92366546156461897602fe4',
    decimals: 18,
  },
  weETH: {
    symbol: 'weETH',
    name: 'Wrapped eETH',
    address: '0x04c0599ae5a44309205625474389146123841773',
    decimals: 18,
  },
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    decimals: 6,
  },
  WETH: {
    symbol: 'WETH',
    name: 'Wrapped Ether',
    address: '0x4200000000000000000000000000000000000006',
    decimals: 18,
  },
  bUSDC: {
    symbol: 'bUSDC',
    name: 'Blend Loan Token: USDC',
    address: '0x1234567890123456789012345678901234567890',
    decimals: 6,
  },
  bETH: {
    symbol: 'bETH',
    name: 'Blend Loan Token: ETH',
    address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    decimals: 18,
  },
};

// Bootstrapped USD prices at t=0; mutated by the crash simulator.
export const INITIAL_PRICES_USD: PriceMap = {
  wstETH: parseUnits('3500', 18),
  weETH: parseUnits('3600', 18),
  USDC: parseUnits('1', 18),
  WETH: parseUnits('3550', 18),
  // Loan tokens priced by their underlying mapping (see resolvePriceSymbol)
  bUSDC: parseUnits('1', 18),
  bETH: parseUnits('3550', 18),
};

// Loan tokens (bTokens) price by their underlying.
// Resolve underlying price symbol from a user-facing symbol.
export function resolvePriceSymbol(symbol: string): string {
  if (symbol === 'bUSDC') return 'USDC';
  if (symbol === 'bETH') return 'WETH';
  return symbol;
}


