import 'dotenv/config';
import { z } from 'zod';

/**
 * Единая точка валидации окружения.
 *
 * Идея: приложение должно падать СРАЗУ на старте с внятным текстом, если
 * переменные заданы криво, а не через полчаса на первом заказе. Поэтому схема
 * строгая, а сообщения — на русском и с подсказкой, чем чинить.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  PORT: z.coerce.number().int().positive().max(65535).default(4000),

  /**
   * Разрешённые источники. Используются дважды: для заголовков CORS и для
   * проверки Origin при оформлении заказа (см. middlewares/origin.ts).
   * В проде '*' оставлять нельзя — тогда форму заказа сможет дёргать чужой сайт.
   */
  CORS_ORIGIN: z.string().default('*'),

  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL обязателен')
    .refine(
      (url) => url.startsWith('postgres://') || url.startsWith('postgresql://'),
      'DATABASE_URL должен начинаться с postgresql:// или postgres://',
    ),

  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET должен быть не короче 32 символов — сгенерируйте его через `npm run keygen`'),

  JWT_EXPIRES_IN: z.string().default('7d'),

  /**
   * Telegram для уведомлений о новых заказах.
   *
   * Обе переменные необязательные: без них магазин работает и заказы
   * сохраняются в базу, просто владелец не получает мгновенное сообщение.
   * Терять заказ из-за неподнятого бота — худший вариант из возможных.
   */
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),

  /** Раздавать ли лендинг из этого же процесса (удобно локально и на одном хостинге). */
  SERVE_STATIC: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // z.prettifyError — идиома Zod 4 (в Zod 3 это делалось через .format()).
  console.error('\n❌ Некорректные переменные окружения:\n');
  console.error(z.prettifyError(parsed.error));
  console.error('\nПодсказка: скопируйте server/.env.example в server/.env и заполните значения.\n');
  process.exit(1);
}

export const env: Env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';

/** Разбирает CORS_ORIGIN в форму, понятную пакету `cors`. */
export function corsOrigin(): string | string[] {
  if (env.CORS_ORIGIN.trim() === '*') return '*';
  return allowedOrigins();
}

/** Список разрешённых источников. Пустой означает «разрешено всё». */
export function allowedOrigins(): string[] {
  if (env.CORS_ORIGIN.trim() === '*') return [];
  return env.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/** Настроен ли Telegram — проверяется до попытки отправки. */
export function telegramConfigured(): boolean {
  return Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
}
