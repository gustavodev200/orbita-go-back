import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// CLI (migrate) usa conexão direta/sessão; runtime usa DATABASE_URL (pooler) via adapter.
// `process.env` em vez de `env()` para `prisma generate` funcionar sem .env (CI/build).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DIRECT_URL ?? '',
  },
});
