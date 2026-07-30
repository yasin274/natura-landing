/**
 * Ошибка, которую МОЖНО показать клиенту.
 *
 * Разделение важное: всё, что не является ApiError, считается непредвиденным
 * багом — такие ошибки наружу отдаются как «500 Внутренняя ошибка» без
 * подробностей, а полный стек уходит только в лог сервера.
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, message: string, code = 'ERROR', details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message = 'Некорректный запрос', details?: unknown): ApiError {
    return new ApiError(400, message, 'BAD_REQUEST', details);
  }

  static unauthorized(message = 'Требуется авторизация'): ApiError {
    return new ApiError(401, message, 'UNAUTHORIZED');
  }

  static forbidden(message = 'Доступ запрещён'): ApiError {
    return new ApiError(403, message, 'FORBIDDEN');
  }

  static notFound(message = 'Ресурс не найден'): ApiError {
    return new ApiError(404, message, 'NOT_FOUND');
  }

  static conflict(message = 'Конфликт данных'): ApiError {
    return new ApiError(409, message, 'CONFLICT');
  }

  static internal(message = 'Внутренняя ошибка сервера'): ApiError {
    return new ApiError(500, message, 'INTERNAL_ERROR');
  }
}
