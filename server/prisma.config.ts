import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 больше НЕ читает .env сам — отсюда `import 'dotenv/config'` выше.
// Строка подключения переехала из schema.prisma сюда, в блоке datasource
// остался только провайдер.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
