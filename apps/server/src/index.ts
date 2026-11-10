import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { createApp } from './app.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const dataDir = resolve(process.env.APP_DATA_DIR ?? resolve(root, '.data/fixture'));
mkdirSync(dataDir, { recursive: true });
const { app } = createApp({ root, enginePersistPath: resolve(dataDir, 'engine-jobs.json') });
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4310);
const host = process.env.HOSTED_MODE === '1' ? '0.0.0.0' : '127.0.0.1';
const address = await app.listen({ host, port });
console.log(`WCAG UI API: ${address} (sample data)`);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
