import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client/client.mts';

export function createCatalogueClient(connectionString) {
  if (!connectionString) throw new Error('A catalogue database URL is required.');
  // The adapter owns the pool and ends it during Prisma's $disconnect().
  const adapter = new PrismaPg({ connectionString, connectionTimeoutMillis: 5000 });
  return new PrismaClient({ adapter });
}
