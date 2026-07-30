import app from './app.js';
import { env, isProduction, telegramConfigured } from './config/env.js';
import { checkDatabaseConnection, disconnectDatabase } from './config/prisma.js';

/**
 * Точка входа. Порядок действий важен:
 *   1. env.ts уже провалидировал окружение на импорте (иначе процесс бы вышел),
 *   2. проверяем БД,
 *   3. только потом слушаем порт.
 */
async function bootstrap(): Promise<void> {
  console.log('🛋  Запуск Natura — магазин мебели');
  console.log(`   Окружение: ${env.NODE_ENV}`);

  const db = await checkDatabaseConnection();

  if (db.ok) {
    console.log('✅ База данных: соединение установлено');
  } else {
    console.error('❌ База данных: нет соединения');
    console.error(`   ${db.error}`);

    // В проде стартовать без БД бессмысленно — пусть оркестратор перезапустит.
    // В деве наоборот удобно поднять сервер и чинить подключение на ходу,
    // не теряя watch-режим.
    if (isProduction) {
      process.exit(1);
    }
    console.warn('⚠️  Сервер поднимется, но каталог и заказы работать не будут (dev-режим).');
    console.warn('   Проверьте DATABASE_URL в server/.env и примените prisma/migrations/0_init.');
  }

  if (!telegramConfigured()) {
    console.warn('⚠️  Telegram не настроен: заказы сохранятся в базу, но уведомлений не будет.');
  }

  const server = app.listen(env.PORT, () => {
    console.log(`✅ Сервер слушает http://localhost:${env.PORT}`);
    console.log(`   Лендинг:      http://localhost:${env.PORT}/`);
    console.log(`   Health-check: http://localhost:${env.PORT}/api/health`);
  });

  /**
   * Graceful shutdown: перестаём принимать новые соединения, затем закрываем
   * пул Postgres. Без этого при рестартах копятся «висящие» соединения, и
   * Postgres рано или поздно упирается в max_connections — тем более что база
   * общая на несколько проектов.
   */
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n${signal} — останавливаю сервер...`);

    server.close(async () => {
      await disconnectDatabase();
      console.log('👋 Остановлено корректно');
      process.exit(0);
    });

    // Страховка: если соединения не закрылись за 10 с — выходим принудительно.
    setTimeout(() => {
      console.error('⏱️  Не дождался закрытия соединений, выхожу принудительно');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((error: unknown) => {
  console.error('💥 Не удалось запустить сервер:', error);
  process.exit(1);
});
