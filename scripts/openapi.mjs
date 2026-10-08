import { createSchema } from '../src/openapi.mjs';

try {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/openapi.mjs https://<deployed-worker-host>');
  console.log(JSON.stringify(createSchema(process.argv[2]), null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
