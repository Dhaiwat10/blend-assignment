import { PrismaClient } from '@prisma/client';

let prismaSingleton: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  if (!prismaSingleton) {
    prismaSingleton = new PrismaClient();
  }
  return prismaSingleton;
}

export function isPrismaEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}


