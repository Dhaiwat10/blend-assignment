import type { PriceMap, Vault } from '../domain/types';
import { INITIAL_PRICES_USD } from '../config/tokens';
import { computeHealthFactor } from '../utils/health';
import { LIQUIDATION_THRESHOLD } from '../config/constants';
import { getPrisma, isPrismaEnabled } from '../persistence/prismaClient';
import { parseUnits, formatUnits } from 'viem';

// Centralized, in-memory source of truth for vault state.
// In production this would be backed by a database or cache.
let currentVaults: Vault[] = [];

// Initial conditions used on every simulation start.
// Keeping seeds immutable ensures reset is deterministic.
const seedVaults: Vault[] = [
  {
    vaultId: 'VAULT-A-WSTETH-BUSDC',
    collateral: { asset: 'wstETH', amount: parseUnits('10', 18) },
    debt: { asset: 'bUSDC', amount: parseUnits('15000', 6) },
  },
  {
    vaultId: 'VAULT-B-WEETH-BETH',
    collateral: { asset: 'weETH', amount: parseUnits('5', 18) },
    debt: { asset: 'bETH', amount: parseUnits('5', 18) },
  },
];

// Mutable price map the crash simulator updates each tick.
let prices: PriceMap = { ...INITIAL_PRICES_USD };

// Reset vault amounts and prices back to the initial snapshot.
export async function resetState(): Promise<void> {
  if (isPrismaEnabled()) {
    const prisma = getPrisma();
    await prisma.$transaction([
      prisma.vault.deleteMany({}),
      prisma.price.deleteMany({}),
    ]);
    // Seed vaults
    for (const v of seedVaults) {
      await prisma.vault.create({
        data: {
          vaultId: v.vaultId,
          collateralAsset: v.collateral.asset,
          collateralAmount: v.collateral.amount.toString(),
          debtAsset: v.debt.asset,
          debtAmount: v.debt.amount.toString(),
        },
      });
    }
    // Seed prices (store human USD decimals, not WAD)
    for (const [symbol, value] of Object.entries(INITIAL_PRICES_USD)) {
      await prisma.price.create({ data: { symbol, value: formatUnits(value, 18) } });
    }
    // Mirror to memory for any callers that rely on local state
    currentVaults = seedVaults.map((v) => ({
      vaultId: v.vaultId,
      collateral: { asset: v.collateral.asset, amount: v.collateral.amount },
      debt: { asset: v.debt.asset, amount: v.debt.amount },
    }));
    prices = { ...INITIAL_PRICES_USD };
    return;
  }
  currentVaults = seedVaults.map((v) => ({
    vaultId: v.vaultId,
    collateral: { asset: v.collateral.asset, amount: v.collateral.amount },
    debt: { asset: v.debt.asset, amount: v.debt.amount },
  }));
  prices = { ...INITIAL_PRICES_USD };
}

// Initialize on module load (best effort; ignore promise)
// eslint-disable-next-line @typescript-eslint/no-floating-promises
resetState();

export function getVaults(): Vault[] {
  return currentVaults;
}

export function getVaultById(id: string): Vault | undefined {
  return currentVaults.find((v) => v.vaultId === id);
}

export function getPrices(): PriceMap {
  return prices;
}

export async function setPrices(next: PriceMap): Promise<void> {
  prices = next;
  if (isPrismaEnabled()) {
    const prisma = getPrisma();
    // Upsert per symbol (store human USD decimals, not WAD)
    for (const [symbol, value] of Object.entries(next)) {
      await prisma.price.upsert({
        where: { symbol },
        update: { value: formatUnits(value, 18) },
        create: { symbol, value: formatUnits(value, 18) },
      });
    }
  }
}

// Apply the projected post-plan state to the vault.
export async function applyRebalance(vaultId: string, newCollateral: bigint, newDebt: bigint): Promise<void> {
  const v = getVaultById(vaultId);
  if (!v) return;
  v.collateral.amount = newCollateral;
  v.debt.amount = newDebt;
  if (isPrismaEnabled()) {
    const prisma = getPrisma();
    await prisma.vault.update({
      where: { vaultId },
      data: {
        collateralAmount: newCollateral.toString(),
        debtAmount: newDebt.toString(),
      },
    });
  }
}

// Convenience wrapper to compute HF using the current price map.
export function computeVaultHf(vault: Vault): bigint {
  return computeHealthFactor({ vault, prices, liquidationThreshold: LIQUIDATION_THRESHOLD });
}


