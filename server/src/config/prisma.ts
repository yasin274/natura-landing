import { PrismaNeon } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { PrismaClient } from '../generated/prisma/client.js';
import { env, isDevelopment } from './env.js';

/**
 * Клиент Prisma.
 *
 * Prisma 7 обязательно требует драйвер-адаптер: `new PrismaClient()` без
 * `adapter` теперь бросает ошибку. Rust-движок выпилен, запросы исполняет
 * связка TypeScript + WASM поверх драйвера.
 *
 * ── Почему драйвер Neon, а не обычный pg ──────────────────────────────────
 *
 * Postgres слушает порт 5432, и у части провайдеров он закрыт: соединение
 * принимается, а на первый же пакет протокола сервер молча отключается.
 * Проверено сравнением — Supabase на порту 6543 отвечает, он же на 5432
 * закрывается, ровно как Neon, который других портов не предлагает.
 *
 * Этот драйвер несёт протокол Postgres внутри WebSocket поверх 443 — порта,
 * который открыт везде. Логика запросов от этого не меняется.
 *
 * Обратная сторона: адаптер привязывает проект к Neon. Переезд на обычный
 * Postgres — это возврат к PrismaPg и строка подключения, больше ничего.
 */
neonConfig.webSocketConstructor = ws;

const adapter = new PrismaNeon({
  connectionString: env.DATABASE_URL,
});

export const prisma = new PrismaClient({
  adapter,
  // В dev показываем предупреждения и ошибки; SQL-запросы включайте точечно,
  // добавив 'query' — иначе лог мгновенно превращается в кашу.
  log: isDevelopment ? ['warn', 'error'] : ['error'],
});

/** Подсказки по кодам, которые реально встречаются при настройке подключения. */
const CAUSE_HINTS: Record<string, string> = {
  ECONNREFUSED: 'Postgres не отвечает на этом хосте/порту — запущен ли сервер?',
  ENOTFOUND: 'Не удалось разрешить хост из DATABASE_URL — проверьте имя сервера.',
  ETIMEDOUT: 'Таймаут подключения — проверьте сеть, firewall и настройки SSL.',
  '28P01': 'Неверный логин или пароль в DATABASE_URL.',
  '3D000': 'Указанной базы данных не существует — создайте её.',
  '42P01': 'Таблиц нет — примените prisma/migrations/0_init/migration.sql.',
};

/**
 * Достаёт человекочитаемую причину сбоя из ошибки Prisma.
 *
 * Prisma 7 оборачивает ошибку драйвера в своё «Invalid invocation» с пустым
 * телом, а настоящая причина (ECONNREFUSED, неверный пароль, нет таблиц)
 * лежит глубже в цепочке `cause`. Без этого разбора диагностика подключения
 * превращается в гадание.
 */
function extractCause(error: unknown): string {
  const messages: string[] = [];
  const codes: string[] = [];
  let current: unknown = error;

  for (let depth = 0; current instanceof Error && depth < 5; depth++) {
    const text = current.message.trim();
    if (text) messages.push(text);

    // У ошибок драйвера pg код лежит в нестандартном поле `code`.
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string') codes.push(code);

    current = (current as { cause?: unknown }).cause;
  }

  const parts = [messages.join(' ')];
  for (const code of codes) {
    parts.push(`(код ${code})`);
    const hint = CAUSE_HINTS[code];
    if (hint) parts.push(hint);
  }

  const combined = parts.join(' ').replace(/\s+/g, ' ').trim();
  return combined || 'причина неизвестна (проверьте DATABASE_URL и доступность Postgres)';
}

/**
 * Проверка соединения на старте.
 *
 * Специально возвращает результат, а не бросает исключение: решение «падать или
 * работать дальше» принимает server.ts, и оно разное для dev и prod.
 */
export async function checkDatabaseConnection(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (error) {
    return { ok: false, error: extractCause(error) };
  }
}

/** Аккуратно закрывает пул соединений при остановке процесса. */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
