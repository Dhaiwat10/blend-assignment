export type Address = string;

export interface TokenMeta {
  symbol: string;
  name: string;
  address: Address;
  decimals: number;
}

export interface PriceMap { [symbol: string]: bigint; } // WAD USD per 1 token

export interface VaultAssetPosition {
  asset: string; // token symbol
  amount: bigint; // base units
}

export interface Vault {
  vaultId: string;
  collateral: VaultAssetPosition;
  debt: VaultAssetPosition; // denominated in Blend loan token (ERC-4626 share)
}

export interface HealthSnapshot {
  vaultId: string;
  timestamp: string; // ISO
  prices: PriceMap;
  healthFactor: number; // display-only
}

export type ExecutionAction =
  | {
      step: number;
      type: 'withdrawCollateral';
      amount: string; // e.g., "1.2 wstETH"
      reason: string;
    }
  | {
      step: number;
      type: 'swap';
      fromToken: string;
      fromAmount: string; // human units
      toToken: string;
      expectedAmount: string; // human units
      minAmount: string; // with slippage
      slippage: string; // e.g., "0.5%"
      dex: string;
      route: string;
    }
  | {
      step: number;
      type: 'repayDebt';
      asset: string; // debt token symbol (e.g., bUSDC)
      amount: string; // human units
      reason: string;
    };

export interface ExecutionPlan {
  targetHealthFactor: number;
  actions: ExecutionAction[];
  projectedOutcome: {
    newCollateralAmount: string; // human units w/ symbol
    newDebtAmount: string; // human units w/ symbol
    estimatedHealthFactor: number;
    gasEstimate: string; // rough text
  };
  atomicExecution: {
    type: 'multicall';
    bundlerCompatible: string;
    calls: Array<{ target: string; value: string; data: string }>;
  };
}

export interface RebalanceEvent {
  timestamp: string;
  vaultId: string;
  hfBefore: number;
  hfAfter: number;
  plan: {
    trigger: {
      healthFactor: number;
      reason: string;
    };
    currentState: {
      collateral: { asset: string; amount: string; valueUSD: number };
      debt: { asset: string; amount: string; valueUSD: number };
    };
    executionPlan: ExecutionPlan;
  };
}


