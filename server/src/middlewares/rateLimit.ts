import type { NextFunction, Request, Response } from 'express';

/**
 * Простой лимитер запросов в памяти процесса.
 *
 * Нужен прежде всего форме заказа: она открыта без авторизации, и единственное,
 * что отделяет публичный эндпоинт от бесплатного способа завалить владельца
 * сообщениями в Telegram, — вот этот счётчик.
 *
 * Именно в памяти, а не в Redis, — осознанно: магазин работает одним
 * инстансом, и внешнее хранилище стало бы лишней зависимостью. Если инстансов
 * станет больше, лимит станет «per-инстанс» — мягче, но не сломается.
 *
 * req.ip корректен за прокси благодаря app.set('trust proxy', 1).
 */

interface Bucket {
  count: number;
  resetAt: number;
}

export function rateLimit(options: { windowMs: number; max: number }) {
  const buckets = new Map<string, Bucket>();

  // Уборка отработанных окон, чтобы Map не рос вечно.
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, options.windowMs).unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    }

    bucket.count++;

    if (bucket.count > options.max) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: `Слишком много запросов — попробуйте через ${retryAfterSec} с`,
        },
      });
      return;
    }

    next();
  };
}
