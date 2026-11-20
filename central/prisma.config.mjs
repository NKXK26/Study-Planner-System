import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'schema.prisma',
  migrations: { path: 'migrations' },
  datasource: { url: process.env.CATALOGUE_DATABASE_URL },
});
