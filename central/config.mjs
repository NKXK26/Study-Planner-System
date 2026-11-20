import { isPasswordHash } from './passwordHash.mjs';

export function readConfig(env) {
  let url;
  try { url = new URL(env.CATALOGUE_DATABASE_URL); } catch {}
  if (!url || !['postgresql:', 'postgres:'].includes(url.protocol) || !url.hostname ||
      url.pathname.length < 2 || url.hash) {
    throw new Error('CATALOGUE_DATABASE_URL must specify a PostgreSQL host and database.');
  }

  let accounts;
  try { accounts = JSON.parse(env.CATALOGUE_PUBLISHERS ?? '{}'); } catch {}
  if (!accounts || typeof accounts !== 'object' || Array.isArray(accounts) ||
      Object.entries(accounts).some(([name, account]) =>
        !name.trim() || /[:\x00-\x1f\x7f]/.test(name) || !account ||
        !['Admin', 'HOD'].includes(account.role) || !isPasswordHash(account.hash))) {
    throw new Error('CATALOGUE_PUBLISHERS requires named Admin or HOD accounts with valid scrypt hashes.');
  }
  if (['production', 'staging'].includes(env.NODE_ENV) && !Object.keys(accounts).length) {
    throw new Error('CATALOGUE_PUBLISHERS requires at least one Admin or HOD publisher.');
  }
  const port = env.PORT || env.CATALOGUE_PORT || '4100';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('The catalogue port must be between 1 and 65535.');
  }
  return { host: env.HOST || '127.0.0.1', port: Number(port), accounts, databaseUrl: env.CATALOGUE_DATABASE_URL };
}
