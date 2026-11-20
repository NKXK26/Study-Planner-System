import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readConfig } from './config.mjs';

// Keep provider diagnostics, including connection details, out of hosted logs.
readConfig(process.env);
const cli = createRequire(import.meta.url).resolve('prisma/build/index.js');
const cwd = fileURLToPath(new URL('.', import.meta.url));
const result = spawnSync(process.execPath, [cli, 'migrate', 'deploy'], { cwd, stdio: 'ignore' });
if (result.status !== 0) {
  console.error('Catalogue migration failed. Check database access and migration status privately.');
  process.exitCode = 1;
} else {
  console.log('Catalogue migrations are current.');
}
