import bcrypt from 'bcrypt';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { signAccessToken } from '../utils/jwt.js';
import { OrderStatus } from '../generated/prisma/enums.js';
import type { ListOrdersQuery, LoginInput } from '../schemas/admin.schema.js';

/**
 * Стоимость хеширования bcrypt.
 *
 * 12 — разумный баланс на 2026 год: ~200–400 мс на обычном железе. Дорого для
 * перебора, терпимо для живого логина. Значение хранится внутри самого хеша,
 * поэтому его можно поднять позже — старые хеши продолжат проверяться.
 */
export const BCRYPT_ROUNDS = 12;

/**
 * Хеш-заглушка для несуществующих админов (см. login).
 * Считается один раз при старте модуля, а не на каждый запрос.
 */
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing-equalisation', BCRYPT_ROUNDS);

export interface LoginResult {
  admin: { id: string; email: string };
  token: string;
}

/** Вход администратора по email и паролю. */
export async function login(input: LoginInput): Promise<LoginResult> {
  const admin = await prisma.adminUser.findUnique({
    where: { email: input.email },
    select: { id: true, email: true, passwordHash: true },
  });

  /**
   * Если админа нет — всё равно прогоняем bcrypt по хешу-заглушке.
   *
   * Иначе ответ «нет такого email» возвращался бы за единицы миллисекунд,
   * а «email есть, пароль неверный» — за сотни. По одной этой разнице
   * перебором вычисляется адрес администратора, а это половина взлома.
   */
  const passwordMatches = admin
    ? await bcrypt.compare(input.password, admin.passwordHash)
    : await bcrypt.compare(input.password, DUMMY_HASH).then(() => false);

  // Текст ошибки одинаковый в обоих случаях — по той же причине.
  if (!admin || !passwordMatches) {
    throw ApiError.unauthorized('Неверный email или пароль');
  }

  return {
    admin: { id: admin.id, email: admin.email },
    token: signAccessToken({ sub: admin.id, email: admin.email }),
  };
}

export interface AdminOrder {
  id: string;
  customerName: string;
  contact: string;
  comment: string | null;
  total: number;
  status: OrderStatus;
  createdAt: Date;
  items: Array<{ title: string; price: number; quantity: number }>;
}

/** Постраничный список заказов с фильтром по статусу. */
export async function listOrders(query: ListOrdersQuery): Promise<{
  items: AdminOrder[];
  total: number;
  limit: number;
  offset: number;
}> {
  const where = query.status === 'all' ? {} : { status: query.status as OrderStatus };

  // Список и счётчик — одной транзакцией, чтобы номера страниц не разъезжались
  // при заказе, пришедшем ровно между двумя запросами.
  const [items, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      skip: query.offset,
      select: {
        id: true,
        customerName: true,
        contact: true,
        comment: true,
        total: true,
        status: true,
        createdAt: true,
        items: { select: { title: true, price: true, quantity: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return { items, total, limit: query.limit, offset: query.offset };
}

/** Смена статуса заказа. */
export async function updateOrderStatus(id: string, status: OrderStatus): Promise<AdminOrder> {
  const existing = await prisma.order.findUnique({ where: { id }, select: { id: true } });

  // Проверяем существование заранее, чтобы отдать понятную 404 вместо
  // невнятного P2025 «An operation failed because it depends on...».
  if (!existing) {
    throw ApiError.notFound('Заказ не найден');
  }

  return prisma.order.update({
    where: { id },
    data: { status },
    select: {
      id: true,
      customerName: true,
      contact: true,
      comment: true,
      total: true,
      status: true,
      createdAt: true,
      items: { select: { title: true, price: true, quantity: true } },
    },
  });
}
