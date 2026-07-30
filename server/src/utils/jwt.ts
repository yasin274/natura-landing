import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from './ApiError.js';

/** Полезная нагрузка админского access-токена. */
export interface AccessTokenPayload {
  /** id администратора (стандартное поле JWT `sub`) */
  sub: string;
  email: string;
}

/**
 * Алгоритм пинуется явно и при подписи, и при проверке.
 *
 * Это защита от «algorithm confusion»: если не ограничить список алгоритмов,
 * злоумышленник может подсунуть токен с заголовком `alg: none` или подменить
 * HS256 на RS256 и заставить библиотеку принять подделку. Классическая дыра
 * в JWT-аутентификации, и закрывается она ровно одной строкой.
 */
const ALGORITHM = 'HS256' as const;

/**
 * JWT_EXPIRES_IN приходит из .env строкой, а @types/jsonwebtoken ждёт здесь
 * литеральный тип `StringValue` из пакета `ms` (например '7d' | '24h').
 * Произвольная строка в него не подходит, поэтому приводим тип явно —
 * само значение проверит `ms` в рантайме и упадёт на старте, если оно кривое.
 */
const expiresIn = env.JWT_EXPIRES_IN as SignOptions['expiresIn'];

/** Подписывает access-токен администратора. */
export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign({ email: payload.email }, env.JWT_SECRET, {
    subject: payload.sub,
    expiresIn,
    algorithm: ALGORITHM,
  });
}

/**
 * Проверяет токен и возвращает нагрузку.
 *
 * Наружу отдаёт только 401 без деталей: клиенту незачем знать, токен
 * просрочен или подпись не сошлась — в обоих случаях действие одно, залогиниться.
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  let decoded: unknown;

  try {
    decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: [ALGORITHM] });
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw ApiError.unauthorized('Срок действия токена истёк');
    }
    throw ApiError.unauthorized('Некорректный токен');
  }

  // jwt.verify по типам возвращает string | JwtPayload — сужаем и проверяем,
  // что внутри действительно наши поля, а не чужой валидный токен.
  if (
    typeof decoded !== 'object' ||
    decoded === null ||
    typeof (decoded as { sub?: unknown }).sub !== 'string' ||
    typeof (decoded as { email?: unknown }).email !== 'string'
  ) {
    throw ApiError.unauthorized('Некорректный токен');
  }

  const payload = decoded as { sub: string; email: string };
  return { sub: payload.sub, email: payload.email };
}

/**
 * Достаёт токен из заголовка `Authorization: Bearer <token>`.
 * Возвращает null, если заголовка нет или он в другом формате.
 */
export function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;

  const [scheme, token, ...rest] = header.split(' ');

  if (rest.length > 0 || !scheme || !token) return null;
  if (scheme.toLowerCase() !== 'bearer') return null;

  return token.trim() || null;
}
