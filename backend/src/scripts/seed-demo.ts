/**
 * Seeds the demo tenant.
 *
 *   npm run seed:demo
 *
 * Safe to run repeatedly: it removes the previous demo tenant and everything
 * that cascades from it, then recreates the set. The demo business is marked
 * `metadata->>'is_demo' = true`, which is what the public demo surface
 * requires before it will serve anything.
 */
import 'dotenv/config';
import { seedDemoTenant } from '../services/demoSeed.service';
import { closePool } from '../utils/database';

async function main() {
  const result = await seedDemoTenant();
  process.stdout.write(
    [
      'Demo tenant seeded.',
      `  business id : ${result.businessId}`,
      `  admin email : ${result.adminEmail}`,
      `  products    : ${result.products}`,
      `  contacts    : ${result.contacts}`,
      `  messages    : ${result.messages}`,
      `  knowledge   : ${result.knowledgeChunks} chunks`,
      '',
    ].join('\n')
  );
}

main()
  .then(async () => {
    await closePool();
    process.exit(0);
  })
  .catch(async (error) => {
    process.stderr.write(`Failed to seed the demo tenant: ${error?.stack || error}\n`);
    await closePool().catch(() => undefined);
    process.exit(1);
  });
