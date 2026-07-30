import type { Request, Response } from 'express';
import * as catalogService from '../services/catalog.service.js';
import { validatedQuery } from '../middlewares/validate.js';
import type { ListProductsQuery } from '../schemas/catalog.schema.js';

/** GET /api/catalog/categories */
export async function categories(_req: Request, res: Response): Promise<void> {
  const items = await catalogService.listCategories();

  res.status(200).json({ success: true, data: { categories: items } });
}

/** GET /api/catalog/products?category=sofas&limit=12&offset=0 */
export async function products(req: Request, res: Response): Promise<void> {
  const query = validatedQuery<ListProductsQuery>(req);
  const result = await catalogService.listProducts(query);

  res.status(200).json({ success: true, data: result });
}

/** GET /api/catalog/products/:slug */
export async function productBySlug(req: Request, res: Response): Promise<void> {
  const slug = String(req.params['slug']);
  const product = await catalogService.getProductBySlug(slug);

  res.status(200).json({ success: true, data: { product } });
}
