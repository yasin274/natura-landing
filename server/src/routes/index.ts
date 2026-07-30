import { Router } from 'express';
import { health } from '../controllers/health.controller.js';
import catalogRoutes from './catalog.routes.js';
import orderRoutes from './order.routes.js';
import adminRoutes from './admin.routes.js';

/** Корневой роутер API. Все модули подключаются здесь одной строкой. */
const router = Router();

router.get('/health', health);
router.use('/catalog', catalogRoutes);
router.use('/orders', orderRoutes);
router.use('/admin', adminRoutes);

export default router;
