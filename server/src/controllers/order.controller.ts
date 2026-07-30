import type { Request, Response } from 'express';
import * as orderService from '../services/order.service.js';
import type { CreateOrderInput } from '../schemas/order.schema.js';

/** POST /api/orders */
export async function create(req: Request, res: Response): Promise<void> {
  const input = req.body as CreateOrderInput;

  /**
   * Боту отвечаем УСПЕХОМ и ничего не сохраняем.
   *
   * Честная ошибка подсказала бы автору скрипта, что ловушка сработала, и он
   * начал бы подбирать обход. Пустой «успех» выглядит как принятый заказ,
   * и повода что-то менять у него нет.
   */
  if (orderService.looksAutomated(input)) {
    res.status(201).json({ success: true, data: { order: { id: null, total: 0, itemsCount: 0 } } });
    return;
  }

  const order = await orderService.createOrder(input);

  res.status(201).json({ success: true, data: { order } });
}
