FROM oven/bun:1 as base

WORKDIR /app

COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile || bun install

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src

# Generate Prisma client at build time (no DB needed)
RUN bun x prisma generate

EXPOSE 3000
CMD ["sh", "-c", "bun run prisma:push && bun run src/index.ts"]


