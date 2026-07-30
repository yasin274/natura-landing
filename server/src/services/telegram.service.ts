import { env, telegramConfigured } from '../config/env.js';

/**
 * Уведомление владельца о новом заказе.
 *
 * Почему это делает сервер, а не браузер: для отправки нужен токен бота, а
 * всё, что попадает в JavaScript страницы, видно любому посетителю. С украденным
 * токеном можно писать от имени бота и читать его переписку. Поэтому токен
 * живёт только в переменных окружения и наружу не отдаётся даже в тексте ошибки.
 */

const TELEGRAM_API = 'https://api.telegram.org';

/** Экранирование под parse_mode: 'HTML' — иначе «<» в имени ломает сообщение. */
function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const rubles = new Intl.NumberFormat('ru-RU');

export interface OrderNotification {
  id: string;
  customerName: string;
  contact: string;
  comment?: string | null;
  total: number;
  items: Array<{ title: string; price: number; quantity: number }>;
}

/**
 * Отправляет сообщение о заказе.
 *
 * Возвращает результат, а не бросает исключение, СПЕЦИАЛЬНО: заказ к этому
 * моменту уже сохранён в базе, и падать из-за недоступного Telegram нельзя —
 * покупатель увидел бы ошибку и оформил бы всё второй раз. Сбой уведомления
 * это проблема владельца (заказ он найдёт в админке), а не покупателя.
 */
export async function notifyNewOrder(order: OrderNotification): Promise<{ sent: boolean }> {
  if (!telegramConfigured()) {
    // Видно только в логах владельца; покупателю ничего не сообщаем.
    console.warn('[telegram] TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID не заданы — заказ только в базе');
    return { sent: false };
  }

  const lines = [
    '<b>🛋 Новый заказ Natura</b>',
    '',
    `<b>Имя:</b> ${escapeHtml(order.customerName)}`,
    `<b>Связь:</b> ${escapeHtml(order.contact)}`,
    '',
    '<b>Состав:</b>',
    ...order.items.map(
      (item) =>
        `• ${escapeHtml(item.title)} — ${item.quantity} × ${rubles.format(item.price)} ₽`,
    ),
    '',
    `<b>Итого: ${rubles.format(order.total)} ₽</b>`,
    order.comment ? `\n<b>Комментарий:</b>\n${escapeHtml(order.comment)}` : '',
    `\n<code>${order.id}</code>`,
  ].filter(Boolean);

  try {
    const response = await fetch(`${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: lines.join('\n'),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      // Без таймаута зависший запрос к Telegram держал бы HTTP-соединение
      // покупателя открытым до победного — а он в это время смотрит на спиннер.
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      // Тело ответа Telegram может содержать часть токена в описании ошибки —
      // в лог пишем только код и описание, наружу не отдаём ничего.
      const detail = (await response.json().catch(() => ({}))) as { description?: string };
      console.error('[telegram] отказ:', response.status, detail.description ?? '');
      return { sent: false };
    }

    return { sent: true };
  } catch (error) {
    console.error(
      '[telegram] сбой отправки:',
      error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    );
    return { sent: false };
  }
}
