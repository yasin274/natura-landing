import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import { notifyNewOrder } from './telegram.service.js';
import type { CreateOrderInput } from '../schemas/order.schema.js';

/** Результат оформления: клиенту достаточно номера и суммы. */
export interface CreatedOrder {
  id: string;
  total: number;
  itemsCount: number;
}

/**
 * Минимальное время заполнения формы.
 *
 * Человек не успевает ввести имя и телефон за две секунды, а скрипт —
 * успевает. Порог намеренно низкий: лучше пропустить бота, чем отсеять
 * покупателя, который заполнил форму автоподстановкой браузера.
 */
const MIN_FILL_MS = 2000;

/**
 * Оформление заказа.
 *
 * Ключевое: сумма считается ЗДЕСЬ, по ценам из базы. Клиент присылает только
 * пары «товар + количество» — см. комментарий в schemas/order.schema.ts.
 */
export async function createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
  /**
   * Одинаковые позиции складываем.
   *
   * Иначе два клика по «в корзину» приехали бы двумя строками одного товара,
   * и лимит max(20) на количество обходился бы простым повторением позиции.
   */
  const quantities = new Map<string, number>();
  for (const item of input.items) {
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
  }

  const products = await prisma.product.findMany({
    where: { id: { in: [...quantities.keys()] }, isPublished: true },
    select: { id: true, title: true, price: true, inStock: true },
  });

  // Товар мог быть снят с витрины, пока корзина лежала в localStorage —
  // а лежать она может месяцами. Молча выкидывать позицию нельзя: покупатель
  // ждёт диван, а приедет только столик.
  if (products.length !== quantities.size) {
    throw ApiError.badRequest(
      'Часть товаров из корзины больше не продаётся. Обновите страницу и проверьте состав заказа.',
    );
  }

  const outOfStock = products.filter((product) => !product.inStock);
  if (outOfStock.length > 0) {
    throw ApiError.conflict(
      `Нет в наличии: ${outOfStock.map((product) => product.title).join(', ')}. Уберите из корзины или напишите нам — подскажем срок поставки.`,
    );
  }

  const items = products.map((product) => ({
    productId: product.id,
    // Снимок названия и цены на момент заказа — см. модель OrderItem.
    title: product.title,
    price: product.price,
    quantity: quantities.get(product.id) ?? 1,
  }));

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const order = await prisma.order.create({
    data: {
      customerName: input.customerName,
      contact: input.contact,
      comment: input.comment ?? null,
      total,
      // Позиции создаём вложенно: Prisma завернёт это в одну транзакцию,
      // и заказ без состава физически не может появиться в базе.
      items: { create: items },
    },
    select: { id: true, total: true },
  });

  /**
   * Уведомление отправляем ПОСЛЕ сохранения и не ждём от него успеха.
   * Заказ уже принят; если Telegram лежит, владелец увидит заказ в админке.
   */
  await notifyNewOrder({
    id: order.id,
    customerName: input.customerName,
    contact: input.contact,
    comment: input.comment,
    total: order.total,
    items,
  });

  return { id: order.id, total: order.total, itemsCount: items.length };
}

/**
 * Похож ли запрос на автоматический.
 *
 * Вынесено в сервис, а не в схему валидации, потому что реакция на ботов
 * особая: им отвечают УСПЕХОМ (см. контроллер), чтобы автор скрипта не понял,
 * что его отсеяли, и не начал подбирать обход.
 */
export function looksAutomated(input: CreateOrderInput): boolean {
  if (input.honey && input.honey.trim().length > 0) return true;

  if (input.openedAt && input.openedAt > 0) {
    const elapsed = Date.now() - input.openedAt;
    // Отрицательное значение — часы клиента врут или время подделали;
    // это тоже повод не доверять отправке.
    if (elapsed < MIN_FILL_MS) return true;
  }

  return false;
}
