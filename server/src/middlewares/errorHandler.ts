import type { NextFunction, Request, Response } from 'express';
import { ZodError, z } from 'zod';
import { ApiError } from '../utils/ApiError.js';
import { isProduction } from '../config/env.js';

/**
 * Централизованный обработчик ошибок — ставится ПОСЛЕДНИМ в цепочке middleware.
 *
 * Express 5 сам ловит отклонённые промисы из async-обработчиков и передаёт их
 * сюда, поэтому городить обёртки вида asyncHandler больше не требуется — в
 * Express 4 без них ошибка из async-роута просто вешала запрос.
 *
 * Четыре аргумента обязательны: Express отличает error-middleware от обычного
 * именно по arity, и убрать «неиспользуемый» _next нельзя.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Ошибки валидации Zod → 400 с разбором по полям.
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Ошибка валидации данных',
        details: z.flattenError(err).fieldErrors,
      },
    });
    return;
  }

  // Наши «ожидаемые» ошибки — отдаём как есть.
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  // Всё остальное — непредвиденный баг. Наружу без подробностей, в лог целиком.
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[ERROR] ${req.method} ${req.originalUrl} →`, err);

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Внутренняя ошибка сервера',
      // Текст ошибки отдаём только в dev: в проде он часто содержит
      // куски SQL, пути на диске и прочее, что не стоит показывать.
      ...(isProduction ? {} : { message_debug: message }),
    },
  });
}
