import { Hono } from 'hono';
import { getPrices, getVaultById, applyRebalance, computeVaultHf, getVaults } from '../../services/vaultService';
import { computeCollateralToSell } from '../../services/rebalanceEngine';
import { logger } from '../../utils/logger';
import { resolvePriceSymbol, TOKENS } from '../../config/tokens';
import { jsonRespond } from '../utils/respond';
import { getRebalanceEvents } from '../../persistence/eventStore';
import { formatUnits, parseUnits } from 'viem';

// Simulates executing the latest plan by applying the projected post-trade
// state to the in-memory store. Useful for demos and dashboards.
export const executeRoute = new Hono();

executeRoute.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const vaultId = body?.vaultId as string | undefined;
  const applyAll = Boolean(body?.applyAll) || (!vaultId && body && Object.keys(body).length === 0);

  // Helper: parse "2.6493 weETH" → base units bigint
  function parseProjectedAmount(amountWithSymbol: string): { base: bigint; symbol: string } {
    const m = String(amountWithSymbol).trim().match(/^([0-9]+(?:\.[0-9]+)?)\s*([A-Za-z0-9]+)/);
    if (!m) throw new Error('Invalid projected amount format');
    const humanStr = m[1];
    const sym = m[2];
    const dec = TOKENS[sym]?.decimals ?? 18;
    const base = parseUnits(humanStr, dec);
    return { base, symbol: sym };
  }

  if (applyAll) {
    logger.section('Executing plans for all vaults from rebalances.json');
    const events = await getRebalanceEvents();
    if (!events.length) return jsonRespond(c, { applied: [], message: 'no events to execute' });
    // Choose latest event per vault
    const latestByVault = new Map<string, typeof events[number]>();
    for (const e of events) latestByVault.set(e.vaultId, e);

    const results: unknown[] = [];
    for (const [vid, e] of latestByVault) {
      const v = getVaultById(vid);
      if (!v) continue;
      const prices = getPrices();
      const hfBeforeWad = computeVaultHf(v);

      const proj = e.plan.executionPlan.projectedOutcome;
      const newCollateralParsed = parseProjectedAmount(proj.newCollateralAmount);
      const newDebtParsed = parseProjectedAmount(proj.newDebtAmount);

      await applyRebalance(vid, newCollateralParsed.base, newDebtParsed.base);
      const hfAfterWad = computeVaultHf(v);

      results.push({
        vaultId: vid,
        before: { healthFactor: Number(Number(formatUnits(hfBeforeWad, 18)).toFixed(3)) },
        after: {
          collateral: { asset: v.collateral.asset, amount: Number(formatUnits(newCollateralParsed.base, TOKENS[v.collateral.asset].decimals)).toFixed(6) },
          debt: { asset: v.debt.asset, amount: Number(formatUnits(newDebtParsed.base, TOKENS[v.debt.asset].decimals)).toFixed(6) },
          healthFactor: Number(Number(formatUnits(hfAfterWad, 18)).toFixed(3)),
        },
      });
    }
    return jsonRespond(c, { applied: results });
  }

  // Single-vault execution (backward-compatible)
  if (!vaultId) return jsonRespond(c, { error: 'vaultId required (or set applyAll=true)' }, 400);

  const vault = getVaultById(vaultId);
  if (!vault) return jsonRespond(c, { error: 'vault not found' }, 404);

  const prices = getPrices();
  const hfBeforeWad = computeVaultHf(vault);
  logger.section('Executing plan');
  logger.info(`Vault ${vault.vaultId} HF(before)=${Number(formatUnits(hfBeforeWad, 18)).toFixed(3)}`);

  const { projected } = computeCollateralToSell({ vault, prices });
  await applyRebalance(vault.vaultId, projected.newCollateralBase, projected.newDebtBase);

  const hfAfterWad = computeVaultHf(vault);
  logger.json('Execution result', {
    vaultId: vault.vaultId,
    before: { hf: Number(Number(formatUnits(hfBeforeWad, 18)).toFixed(3)) },
    after: {
      hf: Number(Number(formatUnits(hfAfterWad, 18)).toFixed(3)),
      collateral: Number(formatUnits(projected.newCollateralBase, TOKENS[vault.collateral.asset].decimals)).toFixed(6),
      debt: Number(formatUnits(projected.newDebtBase, TOKENS[vault.debt.asset].decimals)).toFixed(6),
    },
  });

  return jsonRespond(c, {
    vaultId: vault.vaultId,
    before: { healthFactor: Number(Number(formatUnits(hfBeforeWad, 18)).toFixed(3)) },
    after: {
      collateral: { asset: vault.collateral.asset, amount: Number(formatUnits(projected.newCollateralBase, TOKENS[vault.collateral.asset].decimals)).toFixed(6) },
      debt: { asset: vault.debt.asset, amount: Number(formatUnits(projected.newDebtBase, TOKENS[vault.debt.asset].decimals)).toFixed(6) },
      healthFactor: Number(Number(formatUnits(hfAfterWad, 18)).toFixed(3)),
    },
  });
});


