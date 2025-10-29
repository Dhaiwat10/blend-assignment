import { test, expect } from 'bun:test';
import { writeFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { startSimulation } from '../src/services/simulation';
import { getRebalanceEvents } from '../src/persistence/eventStore';

const EVENTS_PATH = join(process.cwd(), 'data', 'rebalances.json');

async function resetEventsFile() {
  await mkdir(dirname(EVENTS_PATH), { recursive: true });
  await writeFile(EVENTS_PATH, '[]', 'utf8');
}

test('Simulation triggers rebalance and persists event', async () => {
  await resetEventsFile();

  const res = await startSimulation({ tickDelayMsOverride: 0, forceDropSymbol: 'weETH' });
  expect(res.breachVaultId).toBeDefined();

  const events = await getRebalanceEvents();
  expect(events.length).toBeGreaterThan(0);

  const last = events[events.length - 1];
  expect(last.vaultId).toBe('VAULT-B-WEETH-BETH'); // breaches after first tick
  expect(last.hfBefore).toBeLessThan(1.15);
  expect(last.hfAfter).toBeGreaterThan(1.2);
});


