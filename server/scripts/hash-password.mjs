/**
 * Считает bcrypt-хеш пароля для записи в natura_admin_users.
 *
 * Отдельный скрипт, а не эндпоинт «создать администратора»: публичная
 * регистрация админов — это дыра, а закрытая всё равно требует уже
 * существующего админа. Первого заводим руками, одним INSERT.
 *
 * Пароль читаем из аргумента, а не из stdin: скрипт запускают один раз,
 * а интерактивный ввод в Windows-терминалах ведёт себя непредсказуемо.
 * Не забудьте потом почистить историю команд.
 *
 *   node scripts/hash-password.mjs "мой-пароль"
 */
import bcrypt from 'bcrypt';

// Должно совпадать с BCRYPT_ROUNDS в src/services/admin.service.ts.
const ROUNDS = 12;

const password = process.argv[2];

if (!password) {
  console.error('Использование: node scripts/hash-password.mjs "пароль"');
  process.exit(1);
}

if (Buffer.byteLength(password, 'utf8') > 72) {
  // bcrypt молча обрезает вход на 72 БАЙТАХ, и два разных длинных пароля
  // открывали бы один аккаунт. Кириллица в UTF-8 — 2 байта на символ.
  console.error('Пароль длиннее 72 байт — bcrypt его обрежет. Возьмите короче.');
  process.exit(1);
}

const hash = await bcrypt.hash(password, ROUNDS);

console.log('\nВыполните в psql (email замените на свой):\n');
console.log(
  `INSERT INTO "natura_admin_users" ("id", "email", "passwordHash")\nVALUES (gen_random_uuid(), 'admin@natura.ru', '${hash}')\nON CONFLICT ("email") DO UPDATE SET "passwordHash" = EXCLUDED."passwordHash";\n`,
);
