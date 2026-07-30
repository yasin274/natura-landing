import { Router } from 'express';
import * as controller from '../controllers/admin.controller.js';
import { validate } from '../middlewares/validate.js';
import { requireAdmin } from '../middlewares/auth.js';
import { rateLimit } from '../middlewares/rateLimit.js';
import {
  listOrdersQuerySchema,
  loginSchema,
  orderIdParamsSchema,
  updateOrderStatusSchema,
} from '../schemas/admin.schema.js';

const router = Router();

/**
 * Логин лимитируем отдельно и жёстче остальных роутов: это единственная дверь
 * в админку, и без ограничения пароль подбирается перебором со скоростью
 * ответа сервера.
 */
router.post(
  '/login',
  rateLimit({ windowMs: 15 * 60_000, max: 10 }),
  validate({ body: loginSchema }),
  controller.login,
);

// Всё ниже — только с валидным токеном администратора.
router.use(requireAdmin);

router.get('/orders', validate({ query: listOrdersQuerySchema }), controller.orders);

router.patch(
  '/orders/:id/status',
  validate({ params: orderIdParamsSchema, body: updateOrderStatusSchema }),
  controller.updateStatus,
);

export default router;
