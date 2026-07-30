import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

/**
 * Фабрика middleware для валидации запроса схемами Zod.
 *
 * Разобранные значения кладём обратно в req — после этого в контроллере
 * `req.body` уже приведён к типам схемы (числа числами, а не строками).
 *
 * Ошибку не обрабатываем здесь: ZodError улетает в next() и разбирается
 * в errorHandler — так формат ответа об ошибке остаётся ровно один на всё API.
 */
export function validate(schemas: {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.params) {
        Object.assign(req.params, schemas.params.parse(req.params));
      }
      if (schemas.query) {
        // В Express 5 req.query — геттер только на чтение, поэтому результат
        // валидации кладём в отдельное поле, а не переприсваиваем req.query.
        Object.assign(req, { validatedQuery: schemas.query.parse(req.query) });
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Достаёт результат валидации query.
 *
 * Существует ради типов: без неё в каждом контроллере пришлось бы писать
 * `(req as any).validatedQuery`, а любая опечатка в имени поля прошла бы молча.
 */
export function validatedQuery<T>(req: Request): T {
  return (req as Request & { validatedQuery: T }).validatedQuery;
}
