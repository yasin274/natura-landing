import { Router } from 'express';
import * as controller from '../controllers/catalog.controller.js';
import { validate } from '../middlewares/validate.js';
import {
  listProductsQuerySchema,
  productSlugParamsSchema,
} from '../schemas/catalog.schema.js';

const router = Router();

router.get('/categories', controller.categories);

router.get('/products', validate({ query: listProductsQuerySchema }), controller.products);

router.get(
  '/products/:slug',
  validate({ params: productSlugParamsSchema }),
  controller.productBySlug,
);

export default router;
