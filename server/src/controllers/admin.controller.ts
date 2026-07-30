import type { Request, Response } from 'express';
import * as adminService from '../services/admin.service.js';
import { validatedQuery } from '../middlewares/validate.js';
import type {
  ListOrdersQuery,
  LoginInput,
  UpdateOrderStatusInput,
} from '../schemas/admin.schema.js';

/** POST /api/admin/login */
export async function login(req: Request, res: Response): Promise<void> {
  const result = await adminService.login(req.body as LoginInput);

  res.status(200).json({ success: true, data: result });
}

/** GET /api/admin/orders?status=NEW&limit=20&offset=0 */
export async function orders(req: Request, res: Response): Promise<void> {
  const query = validatedQuery<ListOrdersQuery>(req);
  const result = await adminService.listOrders(query);

  res.status(200).json({ success: true, data: result });
}

/** PATCH /api/admin/orders/:id/status */
export async function updateStatus(req: Request, res: Response): Promise<void> {
  const id = String(req.params['id']);
  const { status } = req.body as UpdateOrderStatusInput;

  const order = await adminService.updateOrderStatus(id, status);

  res.status(200).json({ success: true, data: { order } });
}
