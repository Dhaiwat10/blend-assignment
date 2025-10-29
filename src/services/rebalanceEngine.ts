import type { ExecutionPlan, PriceMap, Vault } from '../domain/types';
import { DEFAULT_SLIPPAGE_BPS, LIQUIDATION_THRESHOLD, TARGET_HEALTH_FACTOR, REBALANCE_DEX, UNISWAP_V3_ROUTER, EXECUTOR_ADDRESS } from '../config/constants';
import { resolvePriceSymbol, TOKENS } from '../config/tokens';
import { bpsToWad, clampBigInt, baseToHumanWad, humanWadToBase, wadMul, wadDiv, WAD, displayAmountBase } from '../utils/math';
import { computeHealthFactor } from '../utils/health';
import { encodeApprove, encodeExactOutputSingle, uintFromBase, encodeDeposit } from '../utils/abi';
import { formatUnits } from 'viem';

// Core rebalancing math. Given current state and prices, compute the collateral
// quantity to sell to reach target HF, honoring slippage and preventing over-repay.
export function computeCollateralToSell(params: {
  vault: Vault;
  prices: PriceMap;
  targetHealthFactor?: number; // default 1.25
  liquidationThreshold?: number; // default 0.85
  slippageBps?: number; // default 50
}): {
  sellAmountBase: bigint; // in collateral base units
  repayAmountDebtTokenBase: bigint; // in underlying debt token base units
  projected: { newCollateralBase: bigint; newDebtBase: bigint; newHfWad: bigint };
} {
  const { vault, prices } = params;
  const T = params.targetHealthFactor ?? TARGET_HEALTH_FACTOR;
  const L = params.liquidationThreshold ?? LIQUIDATION_THRESHOLD;
  const s = bpsToWad(params.slippageBps ?? DEFAULT_SLIPPAGE_BPS);

  const Pc = prices[resolvePriceSymbol(vault.collateral.asset)];
  const Pd = prices[resolvePriceSymbol(vault.debt.asset)];
  if (Pc === undefined || Pd === undefined) throw new Error('Missing price for asset');

  const cDec = TOKENS[vault.collateral.asset].decimals;
  const dDec = TOKENS[vault.debt.asset].decimals;

  const Cw = baseToHumanWad(vault.collateral.amount, cDec);
  const Dw = baseToHumanWad(vault.debt.amount, dDec);

  const T_wad = (WAD * BigInt(Math.round(T * 1e6))) / 1_000_000n;
  const L_wad = (WAD * BigInt(Math.round(L * 1e6))) / 1_000_000n;
  const oneMinusS = WAD - s;

  const numerator = (() => {
    const a = wadMul(Cw, Pc);
    const aL = wadMul(a, L_wad);
    const b = wadMul(Dw, Pd);
    const bT = wadMul(b, T_wad);
    return aL - bT;
  })();
  const denom = (() => {
    const inner = L_wad - wadMul(T_wad, oneMinusS);
    const d = wadMul(Pc, inner);
    return d === 0n ? 1n : d;
  })();

  let xWad = wadDiv(numerator, denom);
  xWad = clampBigInt(xWad, 0n, Cw);

  const repayUsdCappedWad = (() => {
    const repayUsd = wadMul(wadMul(xWad, Pc), oneMinusS);
    const maxRepayUsd = wadMul(Dw, Pd);
    return repayUsd > maxRepayUsd ? maxRepayUsd : repayUsd;
  })();
  const repayDebtHumanWad = wadDiv(repayUsdCappedWad, Pd);

  const newCollateralHumanWad = Cw - xWad;
  const newDebtHumanWad = (() => {
    const debtUsd = wadMul(Dw, Pd);
    const newDebtUsd = debtUsd - repayUsdCappedWad;
    return newDebtUsd <= 0n ? 0n : wadDiv(newDebtUsd, Pd);
  })();

  const sellAmountBase = humanWadToBase(xWad, cDec);
  const repayAmountDebtTokenBase = humanWadToBase(
    repayDebtHumanWad,
    TOKENS[resolvePriceSymbol(vault.debt.asset)].decimals,
  );
  const newCollateralBase = humanWadToBase(newCollateralHumanWad, cDec);
  const newDebtBase = humanWadToBase(newDebtHumanWad, dDec);

  const newHfWad = computeHealthFactor({
    vault: {
      vaultId: vault.vaultId,
      collateral: { asset: vault.collateral.asset, amount: newCollateralBase },
      debt: { asset: vault.debt.asset, amount: newDebtBase },
    },
    prices,
    liquidationThreshold: L,
  });

  return {
    sellAmountBase,
    repayAmountDebtTokenBase,
    projected: { newCollateralBase, newDebtBase, newHfWad },
  };
}

// Build a human-readable plan and an atomic multicall payload that executes it.
export function generateExecutionPlan(args: {
  vault: Vault;
  prices: PriceMap;
  slippageBps?: number;
}): ExecutionPlan {
  const { vault, prices } = args;
  const slippageBps = args.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  const slippagePctText = (slippageBps / 100).toFixed(2);

  const Pc = prices[resolvePriceSymbol(vault.collateral.asset)]!;
  const Pd = prices[resolvePriceSymbol(vault.debt.asset)]!;

  const { sellAmountBase, repayAmountDebtTokenBase, projected } = computeCollateralToSell({
    vault,
    prices,
    slippageBps,
  });

  const sWad = bpsToWad(slippageBps);
  const debtUnderlyingSymbol = resolvePriceSymbol(vault.debt.asset);
  const collateralDecimals = TOKENS[vault.collateral.asset].decimals;
  const debtUnderlyingDecimals = TOKENS[debtUnderlyingSymbol].decimals;
  const minAmountDebtTokenBase = (repayAmountDebtTokenBase * (WAD - sWad)) / WAD;
  const expectedHuman = Number(formatUnits(repayAmountDebtTokenBase, debtUnderlyingDecimals));
  const minAmountHuman = Number((expectedHuman * (1 - slippageBps / 10_000)).toFixed(6));

  const actions: ExecutionPlan['actions'] = [
    {
      step: 1,
      type: 'withdrawCollateral',
      amount: displayAmountBase(sellAmountBase, vault.collateral.asset, collateralDecimals),
      reason: 'Withdraw collateral to swap for debt repayment',
    },
    {
      step: 2,
      type: 'swap',
      fromToken: vault.collateral.asset,
      fromAmount: Number(formatUnits(sellAmountBase, collateralDecimals)).toFixed(6),
      toToken: debtUnderlyingSymbol,
      expectedAmount: expectedHuman.toFixed(6),
      minAmount: minAmountHuman.toFixed(6),
      slippage: `${slippagePctText}%`,
      dex: REBALANCE_DEX,
      route: vault.debt.asset === 'bUSDC' ? 'wstETH -> WETH -> USDC' : 'weETH -> WETH',
    },
    {
      step: 3,
      type: 'repayDebt',
      asset: vault.debt.asset,
      amount: Number(formatUnits(repayAmountDebtTokenBase, debtUnderlyingDecimals)).toFixed(6),
      reason: 'Reduce debt to increase health factor',
    },
  ];

  const gasEstimate = '~350,000';

  // Atomic multicall calls (targets + data)
  const collateralToken = TOKENS[vault.collateral.asset].address;
  const debtUnderlyingToken = TOKENS[debtUnderlyingSymbol].address;

  const amountInBase = uintFromBase(sellAmountBase);
  const amountOutBase = uintFromBase(repayAmountDebtTokenBase);
  const deadline = Math.floor(Date.now() / 1000) + 600;

  const approveSwapIn = encodeApprove(UNISWAP_V3_ROUTER, amountInBase);
  const swapData = encodeExactOutputSingle({
    tokenIn: collateralToken,
    tokenOut: debtUnderlyingToken,
    fee: 500, // 0.05%
    recipient: EXECUTOR_ADDRESS,
    deadline,
    amountOutBaseUnits: amountOutBase,
    amountInMaximumBaseUnits: amountInBase,
  });
  const approveDeposit = encodeApprove(TOKENS[vault.debt.asset].address, amountOutBase);
  const depositData = encodeDeposit({ assetsBaseUnits: amountOutBase, receiver: TOKENS[vault.debt.asset].address });

  return {
    targetHealthFactor: TARGET_HEALTH_FACTOR,
    actions,
    projectedOutcome: {
      newCollateralAmount: displayAmountBase(projected.newCollateralBase, vault.collateral.asset, collateralDecimals),
      newDebtAmount: displayAmountBase(projected.newDebtBase, vault.debt.asset, TOKENS[vault.debt.asset].decimals),
      estimatedHealthFactor: Number(Number(formatUnits(projected.newHfWad, 18)).toFixed(3)),
      gasEstimate,
    },
    atomicExecution: {
      type: 'multicall',
      bundlerCompatible: 'Morpho Bundler',
      calls: [
        // Approve collateral to router
        { target: collateralToken, value: '0x0', data: approveSwapIn },
        // Swap collateral -> underlying debt token (route awareness via action.route)
        { target: UNISWAP_V3_ROUTER, value: '0x0', data: swapData },
        // Approve underlying to ERC-4626 vault
        { target: debtUnderlyingToken, value: '0x0', data: approveDeposit },
        // Deposit underlying to mint loan token shares directly to repay target (saves transfer)
        { target: TOKENS[vault.debt.asset].address, value: '0x0', data: depositData },
      ],
    },
  };
}


