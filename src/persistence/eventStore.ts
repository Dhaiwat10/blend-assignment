import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import type { RebalanceEvent } from '../domain/types';
import { getPrisma, isPrismaEnabled } from './prismaClient';

const EVENTS_PATH = join(process.cwd(), 'data', 'rebalances.json');

async function ensureFile(): Promise<void> {
  const dir = dirname(EVENTS_PATH);
  await mkdir(dir, { recursive: true });
  try {
    await readFile(EVENTS_PATH, 'utf8');
  } catch {
    await writeFile(EVENTS_PATH, '[]', 'utf8');
  }
}

export async function persistRebalanceEvent(event: RebalanceEvent): Promise<void> {
  if (isPrismaEnabled()) {
    const prisma = getPrisma();
    await prisma.rebalanceEvent.create({
      data: {
        timestamp: new Date(event.timestamp),
        vaultId: event.vaultId,
        hfBefore: event.hfBefore,
        hfAfter: event.hfAfter,
        plan: event.plan as unknown as object,
      },
    });
    return;
  }

  // Fallback to JSON file persistence if DATABASE_URL not set (keeps tests working)
  await ensureFile();
  const raw = await readFile(EVENTS_PATH, 'utf8');
  const arr: RebalanceEvent[] = JSON.parse(raw || '[]');
  arr.push(event);
  await writeFile(EVENTS_PATH, JSON.stringify(arr, null, 2), 'utf8');
}

export async function getRebalanceEvents(): Promise<RebalanceEvent[]> {
  if (isPrismaEnabled()) {
    const prisma = getPrisma();
    const rows = await prisma.rebalanceEvent.findMany({ orderBy: { timestamp: 'asc' } });
    return rows.map((r: { timestamp: Date; vaultId: string; hfBefore: number; hfAfter: number; plan: unknown }) => ({
      timestamp: r.timestamp.toISOString(),
      vaultId: r.vaultId,
      hfBefore: r.hfBefore,
      hfAfter: r.hfAfter,
      plan: r.plan as unknown as RebalanceEvent['plan'],
    }));
  }

  await ensureFile();
  const raw = await readFile(EVENTS_PATH, 'utf8');
  return JSON.parse(raw || '[]');
}


