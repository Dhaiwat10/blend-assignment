// Crash simulation orchestrator ("simulate crash").
// Drives the price feed, evaluates vault health factors, and emits
// a rebalancing plan when HF < trigger. Endpoint: POST /simulate.
import { applyCrashTick, randomTickDelayMs, sleep } from './priceFeed';
import { computeVaultHf, getPrices, getVaults, resetState } from './vaultService';
import { REBALANCE_TRIGGER_HF } from '../config/constants';
import { generateExecutionPlan } from './rebalanceEngine';
import type { RebalanceEvent } from '../domain/types';
import { persistRebalanceEvent } from '../persistence/eventStore';
import { resolvePriceSymbol, TOKENS } from '../config/tokens';
import { toUsd, baseToHumanWad, wadMul } from '../utils/math';
import { logger } from '../utils/logger';
import { emit } from './eventBus';
import { formatUnits } from 'viem';

// Guard against concurrent runs; simulation is single-flight.
let running = false;

export function isRunning(): boolean {
  return running;
}

// Entry point for one full simulation run. Stops at first breach, then optionally
// continues for a fixed number of extra ticks to observe deeper drawdowns.
export async function startSimulation(options?: { extraTicksAfterBreach?: number; tickDelayMsOverride?: number; forceDropSymbol?: 'wstETH' | 'weETH' }): Promise<{
  startedAt: string;
  ticks: number;
  breachVaultId?: string;
  breachHf?: number;
  extraTicksExecuted?: number;
}> {
  if (running) return { startedAt: new Date().toISOString(), ticks: 0 };
  // Reset to initial conditions
  await resetState();
  running = true;
  const startedAt = new Date().toISOString();
  let ticks = 0;
  const extraTicks = Math.max(0, Number(options?.extraTicksAfterBreach ?? 0));
  let extraExecuted = 0;

  // Log initial state
  const prices0 = getPrices();
  logger.section('Simulation start');
  logger.json('Initial prices (USD)', Object.fromEntries(Object.entries(prices0).map(([k, v]) => [k, Math.round(Number(formatUnits(v, 18)) * 100) / 100])));
  emit('simulationStart', { prices: Object.fromEntries(Object.entries(prices0).map(([k, v]) => [k, Math.round(Number(formatUnits(v, 18)) * 100) / 100])) });
  for (const v of getVaults()) {
    const Pc0 = prices0[resolvePriceSymbol(v.collateral.asset)];
    const Pd0 = prices0[resolvePriceSymbol(v.debt.asset)];
    const hf0Wad = computeVaultHf(v);
    const cDec = TOKENS[v.collateral.asset].decimals;
    const dDec = TOKENS[v.debt.asset].decimals;
    logger.info(
      `Vault ${v.vaultId} | HF=${Number(formatUnits(hf0Wad, 18)).toFixed(3)} | Collateral ${v.collateral.asset}=${Number(formatUnits(v.collateral.amount, cDec)).toFixed(4)} ($${toUsd(wadMul(baseToHumanWad(v.collateral.amount, cDec), Pc0))}) | Debt ${v.debt.asset}=${Number(formatUnits(v.debt.amount, dDec)).toFixed(4)} ($${toUsd(wadMul(baseToHumanWad(v.debt.amount, dDec), Pd0))})`,
    );
  }

  try {
    while (true) {
      // Check current HFs before tick (Vault B may already be below threshold at t=0)
      const vaults = getVaults();
      const prices = getPrices();
      for (const v of vaults) {
        const hfWad = computeVaultHf(v);
        if (Number(formatUnits(hfWad, 18)) < REBALANCE_TRIGGER_HF) {
          logger.section('Breach detected');
          logger.info(`Vault ${v.vaultId} HF=${Number(formatUnits(hfWad, 18)).toFixed(3)} < ${REBALANCE_TRIGGER_HF}`);
          await handleBreach(v.vaultId, Number(formatUnits(hfWad, 18)));
          if (extraTicks > 0) {
            extraExecuted = await continueAfterBreach(extraTicks, ticks, { tickDelayMsOverride: options?.tickDelayMsOverride, forceDropSymbol: options?.forceDropSymbol });
          }
          running = false;
          return { startedAt, ticks, breachVaultId: v.vaultId, breachHf: Number(formatUnits(hfWad, 18)), extraTicksExecuted: extraExecuted };
        }
      }

      // Wait between 2–3 seconds (or override)
      await sleep(options?.tickDelayMsOverride ?? randomTickDelayMs());

      // Apply crash tick and then re-evaluate
      const tickInfo = applyCrashTick(options?.forceDropSymbol);
      logger.info(
        `[Tick ${ticks + 1}] Price drop ${tickInfo.changed.symbol}: -${tickInfo.changed.dropPct}% ${tickInfo.changed.old} -> ${tickInfo.changed.new}`,
      );
      emit('tick', tickInfo);
      ticks += 1;

      const vaultsAfter = getVaults();
      const pricesAfter = getPrices();
      for (const v of vaultsAfter) {
        const PcA = pricesAfter[resolvePriceSymbol(v.collateral.asset)];
        const PdA = pricesAfter[resolvePriceSymbol(v.debt.asset)];
        const hfAWad = computeVaultHf(v);
        const cDec = TOKENS[v.collateral.asset].decimals;
        const dDec = TOKENS[v.debt.asset].decimals;
        logger.info(
          `Vault ${v.vaultId} | HF=${Number(formatUnits(hfAWad, 18)).toFixed(3)} | Collateral ${v.collateral.asset}=${Number(formatUnits(v.collateral.amount, cDec)).toFixed(4)} ($${toUsd(wadMul(baseToHumanWad(v.collateral.amount, cDec), PcA))}) | Debt ${v.debt.asset}=${Number(formatUnits(v.debt.amount, dDec)).toFixed(4)} ($${toUsd(wadMul(baseToHumanWad(v.debt.amount, dDec), PdA))})`,
        );
      }
      for (const v of vaultsAfter) {
        const hfWad = computeVaultHf(v);
        if (Number(formatUnits(hfWad, 18)) < REBALANCE_TRIGGER_HF) {
          logger.section('Breach detected');
          logger.info(`Vault ${v.vaultId} HF=${Number(formatUnits(hfWad, 18)).toFixed(3)} < ${REBALANCE_TRIGGER_HF}`);
          await handleBreach(v.vaultId, Number(formatUnits(hfWad, 18)));
          // breach event published inside handleBreach
          if (extraTicks > 0) {
            extraExecuted = await continueAfterBreach(extraTicks, ticks, { tickDelayMsOverride: options?.tickDelayMsOverride, forceDropSymbol: options?.forceDropSymbol });
          }
          running = false;
          return { startedAt, ticks, breachVaultId: v.vaultId, breachHf: Number(formatUnits(hfWad, 18)), extraTicksExecuted: extraExecuted };
        }
      }
    }
  } finally {
    running = false;
  }
}

async function handleBreach(vaultId: string, hfBefore: number): Promise<void> {
  const vaults = getVaults();
  const v = vaults.find((x) => x.vaultId === vaultId);
  if (!v) return;
  const prices = getPrices();

  const plan = generateExecutionPlan({ vault: v, prices });

  // Log execution plan in a readable way
  logger.section('Rebalancing plan');
  logger.info(`Vault ${v.vaultId} target HF=${plan.targetHealthFactor}`);
  for (const action of plan.actions) {
    if (action.type === 'withdrawCollateral') {
      logger.info(`[Action ${action.step}] withdrawCollateral ${action.amount} — ${action.reason}`);
    } else if (action.type === 'swap') {
      logger.info(
        `[Action ${action.step}] swap ${action.fromAmount} ${action.fromToken} -> ${action.toToken} | expected=${action.expectedAmount} min=${action.minAmount} @ ${action.slippage} via ${action.dex} (${action.route})`,
      );
    } else if (action.type === 'repayDebt') {
      logger.info(`[Action ${action.step}] repayDebt ${action.amount} ${action.asset} — ${action.reason}`);
    }
  }
  logger.info(
    `Projected → Collateral=${plan.projectedOutcome.newCollateralAmount}, Debt=${plan.projectedOutcome.newDebtAmount}, HF≈${plan.projectedOutcome.estimatedHealthFactor} ${classify(plan.projectedOutcome.estimatedHealthFactor)}`,
  );

  const collateralPrice = prices[resolvePriceSymbol(v.collateral.asset)];
  const debtPrice = prices[resolvePriceSymbol(v.debt.asset)];

  const event: RebalanceEvent = {
    timestamp: new Date().toISOString(),
    vaultId: v.vaultId,
    hfBefore,
    hfAfter: plan.projectedOutcome.estimatedHealthFactor,
    plan: {
      trigger: {
        healthFactor: hfBefore,
        reason: `Below rebalance threshold of ${REBALANCE_TRIGGER_HF}`,
      },
      currentState: {
        collateral: {
          asset: v.collateral.asset,
          amount: Number(formatUnits(v.collateral.amount, TOKENS[v.collateral.asset].decimals)).toFixed(6),
          valueUSD: toUsd(wadMul(baseToHumanWad(v.collateral.amount, TOKENS[v.collateral.asset].decimals), collateralPrice)),
        },
        debt: {
          asset: v.debt.asset,
          amount: Number(formatUnits(v.debt.amount, TOKENS[v.debt.asset].decimals)).toFixed(6),
          valueUSD: toUsd(wadMul(baseToHumanWad(v.debt.amount, TOKENS[v.debt.asset].decimals), debtPrice)),
        },
      },
      executionPlan: plan,
    },
  };

  logger.json('RebalanceEvent', event);
  await persistRebalanceEvent(event);
  logger.info(`Persisted rebalance event for ${v.vaultId}`);
  emit('rebalance', event);
}
function classify(hf: number): string {
  if (hf < 1) return '(liquidatable)';
  if (hf < REBALANCE_TRIGGER_HF) return '(breach)';
  if (hf < 1.25) return '(monitor)';
  return '(healthy)';
}

async function continueAfterBreach(extraTicks: number, currentTick: number, options?: { tickDelayMsOverride?: number; forceDropSymbol?: 'wstETH' | 'weETH' }): Promise<number> {
  logger.section(`Continuing after breach for ${extraTicks} tick(s)`);
  let executed = 0;
  while (executed < extraTicks) {
    await sleep(options?.tickDelayMsOverride ?? randomTickDelayMs());
    const tickInfo = applyCrashTick(options?.forceDropSymbol);
    logger.info(
      `[Tick ${currentTick + executed + 1}] Price drop ${tickInfo.changed.symbol}: -${tickInfo.changed.dropPct}% ${tickInfo.changed.old} -> ${tickInfo.changed.new}`,
    );

    const prices = getPrices();
    for (const v of getVaults()) {
      const Pc = prices[resolvePriceSymbol(v.collateral.asset)];
      const Pd = prices[resolvePriceSymbol(v.debt.asset)];
      const hfWad = computeVaultHf(v);
      const cDec = TOKENS[v.collateral.asset].decimals;
      const dDec = TOKENS[v.debt.asset].decimals;
      logger.info(
        `Vault ${v.vaultId} | HF=${Number(formatUnits(hfWad, 18)).toFixed(3)} | Collateral ${v.collateral.asset}=${Number(formatUnits(v.collateral.amount, cDec)).toFixed(4)} ($${toUsd(wadMul(baseToHumanWad(v.collateral.amount, cDec), Pc))}) | Debt ${v.debt.asset}=${Number(formatUnits(v.debt.amount, dDec)).toFixed(4)} ($${toUsd(wadMul(baseToHumanWad(v.debt.amount, dDec), Pd))})`,
      );

      if (Number(formatUnits(hfWad, 18)) < REBALANCE_TRIGGER_HF) {
        // Generate and persist an updated plan at this deeper drawdown
        await handleBreach(v.vaultId, Number(formatUnits(hfWad, 18)));
      }
    }
    executed += 1;
  }
  return executed;
}


