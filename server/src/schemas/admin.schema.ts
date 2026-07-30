import { z } from 'zod';
import { OrderStatus } from '../generated/prisma/enums.js';

/** Схемы админского модуля: вход и работа с заказами. */

/**
 * Email приводим к нижнему регистру и обрезаем пробелы ДО сравнения с базой.
 * Иначе «Admin@natura.ru» и «admin@natura.ru» будут разными строками,
 * несмотря на @unique в схеме.
 *
 * Порядок здесь критичен и неочевиден. Запись вида
 * `z.email().trim().toLowerCase()` НЕ работает: Zod сначала проверяет формат
 * и только потом применяет преобразования, поэтому « Admin@Mail.RU » с пробелом
 * по краям отваливается как «некорректный email», не дойдя до trim.
 * Через .pipe() порядок обратный — сначала чистим строку, потом проверяем.
 */
const email = z
  .string({ error: 'Укажите email' })
  .trim()
  .toLowerCase()
  .pipe(z.email('Некорректный email').max(255, 'Email слишком длинный'));

export const loginSchema = z.object({
  email,
  // На логине к паролю применяем только базовую проверку: правила сложности
  // могли измениться с момента заведения админа, и старый пароль обязан работать.
  password: z.string({ error: 'Укажите пароль' }).min(1, 'Введите пароль'),
});

/**
 * Значения фильтра статуса: все статусы модели плюс псевдо-значение 'all'.
 * Собираем из enum'а Prisma, а не переписываем руками, — иначе новый статус
 * в схеме БД молча перестал бы фильтроваться в админке.
 */
const statusFilters = ['all', ...Object.values(OrderStatus)] as const;

export const listOrdersQuerySchema = z.object({
  /** Фильтр по статусу. 'all' — без фильтра, значение по умолчанию. */
  status: z.enum(statusFilters).default('all'),

  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const orderIdParamsSchema = z.object({
  id: z.uuid('Некорректный идентификатор заказа'),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(OrderStatus),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
export type OrderIdParams = z.infer<typeof orderIdParamsSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
