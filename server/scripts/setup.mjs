/**
 * Разворачивает базу Natura с нуля: схема, каталог, администратор.
 *
 * ── Почему драйвер Neon, а не обычный pg ────────────────────────────────────
 *
 * Postgres слушает порт 5432, и у части провайдеров он закрыт: соединение
 * принимается, а на первый же пакет протокола сервер молча отключается.
 * Проверено сравнением — Supabase на порту 6543 отвечает, он же на 5432
 * закрывается, как и Neon, который других портов не предлагает.
 *
 * Драйвер `@neondatabase/serverless` ходит по WebSocket поверх 443 — тому
 * самому порту, по которому работает весь остальной интернет. Протокол
 * Postgres внутри тот же, отличается только транспорт.
 *
 * ── Почему не `prisma migrate deploy` ───────────────────────────────────────
 *
 * Через пулер управляемых баз не проходит schema engine Prisma: пулер не
 * держит сессионное состояние, на котором тот построен. DDL применяется
 * напрямую, одним куском внутри транзакции.
 *
 * ── Идемпотентность ─────────────────────────────────────────────────────────
 *
 * Гонять можно повторно: в миграции везде IF NOT EXISTS, сиды пропускаются,
 * если каталог уже заполнен, администратор обновляется по email.
 *
 *   node scripts/setup.mjs                      — схема и каталог
 *   node scripts/setup.mjs --admin "пароль"     — плюс администратор
 *   node scripts/setup.mjs --schema             — только схема
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { Client, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import 'dotenv/config';

// В Node нет встроенного WebSocket-клиента для этого драйвера — подставляем ws.
neonConfig.webSocketConstructor = ws;

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const schemaOnly = argv.includes('--schema');

const adminFlag = argv.indexOf('--admin');
const adminPassword = adminFlag >= 0 ? argv[adminFlag + 1] : null;

const ADMIN_EMAIL = 'admin@natura.local';
// Должно совпадать с BCRYPT_ROUNDS в src/services/admin.service.ts.
const ROUNDS = 12;

if (!process.env.DATABASE_URL) {
  console.error(
    'Не задан DATABASE_URL.\n\n' +
      'Открой server/.env и вставь строку подключения.\n' +
      'Для Neon: Dashboard → проект → Connect → Connection string.',
  );
  process.exit(1);
}

if (adminFlag >= 0 && (!adminPassword || adminPassword.length < 8)) {
  console.error('После --admin нужен пароль не короче 8 символов.');
  process.exit(1);
}

const client = new Client(process.env.DATABASE_URL);
await client.connect();

try {
  // ── Схема ────────────────────────────────────────────────────────────────
  const ddl = await readFile(resolve(here, '../prisma/migrations/0_init/migration.sql'), 'utf8');
  await client.query('begin');
  await client.query(ddl);
  await client.query('commit');

  const { rows: tables } = await client.query(`
    select table_name from information_schema.tables
     where table_schema = 'public' and table_name like 'natura_%'
     order by table_name
  `);
  console.log(`Схема на месте: ${tables.map((t) => t.table_name).join(', ')}`);

  if (schemaOnly) {
    console.log('Каталог пропущен (--schema).');
    await client.end();
    process.exit(0);
  }

  // ── Каталог ──────────────────────────────────────────────────────────────
  const { rows: counted } = await client.query('select count(*)::int as n from natura_products');

  if (counted[0].n > 0) {
    console.log(`Каталог уже заполнен: ${counted[0].n} товаров — сиды пропущены.`);
  } else {
    const seed = await readFile(resolve(here, '../prisma/seed.sql'), 'utf8');
    await client.query('begin');
    await client.query(seed);
    await client.query('commit');

    const { rows: after } = await client.query('select count(*)::int as n from natura_products');
    console.log(`Каталог засеян: ${after[0].n} товаров.`);
  }

  // ── Администратор ────────────────────────────────────────────────────────
  //
  // Заводится только по явному флагу: пароль попадает в историю команд, и
  // делать это молча при каждом прогоне неправильно.
  if (adminPassword) {
    const hash = await bcrypt.hash(adminPassword, ROUNDS);
    await client.query(
      `insert into natura_admin_users (id, email, "passwordHash")
            values ($1, $2, $3)
       on conflict (email) do update set "passwordHash" = excluded."passwordHash"`,
      [randomUUID(), ADMIN_EMAIL, hash],
    );
    console.log(`\nАдминистратор: ${ADMIN_EMAIL}\nПароль тот, что передан флагом --admin.`);
    console.log('Историю команд после этого лучше почистить.');
  } else {
    console.log('\nАдминистратор не заводился. Нужен — прогони с --admin "пароль".');
  }
} catch (error) {
  await client.query('rollback').catch(() => {});
  console.error('Не получилось:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
