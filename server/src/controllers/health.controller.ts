import type { Request, Response } from 'express';
import { checkDatabaseConnection } from '../config/prisma.js';
import { telegramConfigured } from '../config/env.js';

/**
 * GET /api/health
 *
 * Отвечает 503, когда база недоступна: для внешнего мониторинга и оркестратора
 * «процесс жив, но заказы принять не может» — это не «ок», а авария.
 */
export async function health(_req: Request, res: Response): Promise<void> {
  const db = await checkDatabaseConnection();

  res.status(db.ok ? 200 : 503).json({
    success: db.ok,
    data: {
      status: db.ok ? 'ok' : 'degraded',
      database: db.ok ? 'up' : 'down',
      // Не секрет: сообщает лишь, настроены ли переменные, но не их значения.
      telegram: telegramConfigured() ? 'configured' : 'not_configured',
      uptimeSec: Math.round(process.uptime()),
      time: new Date().toISOString(),
    },
  });
}
