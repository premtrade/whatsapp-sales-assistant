/**
 * Seeds the demo tenant.
 *
 *   npm run seed:demo
 *   npm run seed:demo -- --password=<password> --email=<email>
 *
 * Safe to run repeatedly: it removes the previous demo tenant and everything
 * that cascades from it, then recreates the set. The demo business is marked
 * `metadata->>'is_demo' = true`, which is what the public demo surface
 * requires before it will serve anything.
 *
 * The password can be supplied on the command line so the demo account does
 * not have to use the built-in default in a real deployment.
 */
import 'dotenv/config';
import { seedDemoTenant } from '../services/demoSeed.service';
import { closePool } from '../utils/database';

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

async function main() {
  const result = await seedDemoTenant({
    adminEmail: arg('email'),
    adminPassword: arg('password'),
  });
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
