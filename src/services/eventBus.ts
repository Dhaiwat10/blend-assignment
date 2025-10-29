export type BusEvent = {
  type: 'simulationStart' | 'tick' | 'rebalance' | 'health';
  timestamp: string;
  data: unknown;
};

type Subscriber = (evt: BusEvent) => void;

const subscribers = new Set<Subscriber>();

export function subscribe(fn: Subscriber): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function emit(type: BusEvent['type'], data: unknown): void {
  const evt: BusEvent = { type, timestamp: new Date().toISOString(), data };
  for (const fn of subscribers) {
    try {
      fn(evt);
    } catch {
      // ignore bad subscriber
    }
  }
}


