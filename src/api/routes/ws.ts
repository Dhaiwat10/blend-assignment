import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { subscribe } from '../../services/eventBus';
import { getVaults, getPrices } from '../../services/vaultService';
import { resolvePriceSymbol } from '../../config/tokens';
import { computeHealthFactor } from '../../utils/health';
import { formatUnits } from 'viem';

export const wsRoute = new Hono();

// Implement as SSE for broad compatibility
wsRoute.get('/', async (c) => {
  return streamSSE(c, async (stream) => {
    // send initial snapshot
    try {
      const prices = getPrices();
      const vaults = getVaults().map((v) => {
        const Pc = prices[resolvePriceSymbol(v.collateral.asset)];
        const Pd = prices[resolvePriceSymbol(v.debt.asset)];
        const hfWad = computeHealthFactor({ vault: v, prices, liquidationThreshold: 0.85 });
        return {
          vaultId: v.vaultId,
          collateral: { ...v.collateral },
          debt: { ...v.debt },
          healthFactor: Number(Number(formatUnits(hfWad, 18)).toFixed(3)),
        };
      });
      await stream.writeSSE({ event: 'snapshot', data: JSON.stringify({ prices: Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, Math.round(Number(formatUnits(v, 18)) * 100) / 100])), vaults }) });
    } catch {}

    const unsub = subscribe(async (evt) => {
      try {
        await stream.writeSSE({ event: evt.type, data: JSON.stringify(evt.data) });
      } catch {}
    });

    // Keep the stream open until the client disconnects
    const abortPromise = new Promise<void>((resolve) => {
      c.req.raw.signal.addEventListener('abort', () => resolve(), { once: true });
    });
    await abortPromise;
    unsub();
  });
});


