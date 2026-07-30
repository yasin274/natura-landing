import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { extractBearerToken, verifyAccessToken } from '../utils/jwt.js';

/**
 * Расширяем тип Request, чтобы `req.admin` был типизирован во всём приложении.
 *
 * Поле опциональное: на публичных роутах (каталог, оформление заказа) его нет.
 * Как следствие, в защищённых контроллерах TypeScript будет требовать проверку —
 * поэтому ниже есть requireAdminUser(), чтобы не писать её руками каждый раз.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: {
        id: string;
        email: string;
      };
    }
  }
}

/**
 * Middleware защиты админских роутов: проверяет `Authorization: Bearer <token>`.
 *
 * Права СПЕЦИАЛЬНО перепроверяются в БД на каждом запросе, хотя id уже есть
 * в токене. Причина: токен неотзываем до истечения срока. Если бы факт
 * «этот человек — админ» брался только из подписи, то удаление админа
 * вступало бы в силу не сразу, а через JWT_EXPIRES_IN — до тех пор уволенный
 * менеджер продолжал бы спокойно читать заказы и менять их статусы.
 *
 * Цена — один SELECT по первичному ключу на защищённый запрос.
 */
export async function requireAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractBearerToken(req.headers.authorization);

    if (!token) {
      throw ApiError.unauthorized('Требуется заголовок Authorization: Bearer <token>');
    }

    const payload = verifyAccessToken(token);

    const admin = await prisma.adminUser.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true },
    });

    // Токен валиден, а записи нет — админа удалили уже после выдачи токена.
    if (!admin) {
      throw ApiError.unauthorized('Учётная запись администратора не найдена');
    }

    req.admin = admin;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Достаёт администратора из запроса, гарантируя его наличие на уровне типов.
 *
 * Нужна, чтобы в контроллерах не писать `req.admin!` — восклицание подавляет
 * проверку и молча ломается, если роут случайно оставят без requireAdmin.
 * Здесь же промах превратится в честную 401.
 */
export function requireAdminUser(req: Request): { id: string; email: string } {
  if (!req.admin) {
    throw ApiError.unauthorized();
  }
  return req.admin;
}
