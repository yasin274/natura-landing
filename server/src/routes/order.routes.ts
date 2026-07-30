import { Router } from 'express';
import * as controller from '../controllers/order.controller.js';
import { validate } from '../middlewares/validate.js';
import { rateLimit } from '../middlewares/rateLimit.js';
import { requireKnownOrigin } from '../middlewares/origin.js';
import { createOrderSchema } from '../schemas/order.schema.js';

const router = Router();

/**
 * Три рубежа защиты на единственном публичном «пишущем» эндпоинте:
 *   1) Origin — запрос должен прийти с нашей страницы;
 *   2) частота — не больше 8 попыток с адреса за 10 минут (заказ оформляют
 *      раз в жизни, а не восемь раз в минуту);
 *   3) схема + ловушка для ботов внутри неё.
 */
router.post(
  '/',
  requireKnownOrigin,
  rateLimit({ windowMs: 10 * 60_000, max: 8 }),
  validate({ body: createOrderSchema }),
  controller.create,
);

export default router;
