import { createApp } from './api/server';

const port = Number(process.env.PORT || 3000);
const app = createApp();

// Bun server
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const server: any = (globalThis as any).Bun?.serve?.({
  port,
  fetch: app.fetch,
});

if (!server) {
  console.log('Bun runtime not detected. Exiting.');
  process.exit(1);
}

console.log(`Blend Risk Simulator (Bun+Hono) listening on port ${port}`);


