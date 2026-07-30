import type { NextFunction, Request, Response } from 'express';
import { allowedOrigins } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Пускает к эндпоинту только запросы с наших страниц.
 *
 * Зачем, если есть CORS: браузерный CORS защищает ЧУЖОГО пользователя от
 * нашего ответа, но не мешает чужому сайту отправить запрос и создать заказ —
 * ответ ему просто не покажут, а заказ уже сохранится и улетит в Telegram.
 * Проверка Origin на сервере закрывает именно этот сценарий.
 *
 * Пустой Origin (curl, серверные клиенты, боты) тоже не пускаем: эндпоинт
 * предназначен для формы в браузере, и легальных запросов без Origin у него нет.
 *
 * Если CORS_ORIGIN=* (режим разработки), проверка отключается целиком —
 * иначе локальный «Live Server» на случайном порту не смог бы отправить заказ.
 */
export function requireKnownOrigin(req: Request, _res: Response, next: NextFunction): void {
  const permitted = allowedOrigins();

  if (permitted.length === 0) {
    next();
    return;
  }

  const origin = req.headers.origin ?? '';

  if (!permitted.includes(origin)) {
    next(ApiError.forbidden('Источник запроса не разрешён'));
    return;
  }

  next();
}
