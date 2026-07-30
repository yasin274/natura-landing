import type { Request, Response } from 'express';

/** Ставится после всех роутов: любой неопознанный путь → аккуратный JSON-404. */
export function notFound(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Маршрут ${req.method} ${req.originalUrl} не найден`,
    },
  });
}
