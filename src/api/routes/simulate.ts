import { Hono } from 'hono';
import { isRunning, startSimulation } from '../../services/simulation';
import { logger } from '../../utils/logger';
import { jsonRespond } from '../utils/respond';

// Starts a single crash simulation run ("simulate crash").
// Naming note: the path is `/simulate` per spec, but functionally this
// endpoint drives the crash simulation loop until a breach is detected.
// The service is single-flight guarded.
export const simulateRoute = new Hono();

simulateRoute.post('/', async (c) => {
  logger.section('POST /simulate');
  if (isRunning()) {
    logger.warn('Simulation already running');
    return jsonRespond(c, { started: false, message: 'Simulation already running' }, 409);
  }
  const q = c.req.query('extraTicks');
  let body: any = undefined;
  try {
    body = await c.req.json();
  } catch {
    // ignore if no JSON body
  }
  const extra = Number(body?.extraTicksAfterBreach ?? (q !== undefined ? Number(q) : 0) ?? 0);
  logger.info(`Starting simulation run... extraTicksAfterBreach=${extra}`);
  const res = await startSimulation({ extraTicksAfterBreach: isNaN(extra) ? 0 : extra });
  logger.info(
    `Simulation completed after ${res.ticks} ticks (+${res.extraTicksExecuted ?? 0} extra); breach vault: ${res.breachVaultId}`,
  );
  return jsonRespond(c, { started: true, ...res });
});


