import { Hono } from 'hono';
import { getRebalanceEvents } from '../../persistence/eventStore';
import { jsonRespond } from '../utils/respond';

// Returns the append-only history of `RebalanceEvent`s.
export const rebalancesRoute = new Hono();

rebalancesRoute.get('/', async (c) => {
  const events = await getRebalanceEvents();
  return jsonRespond(c, events);
});


