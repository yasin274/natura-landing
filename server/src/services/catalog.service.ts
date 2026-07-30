import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/ApiError.js';
import type { ListProductsQuery } from '../schemas/catalog.schema.js';

/**
 * Публичный каталог. Всё, что отсюда возвращается, попадает на страницу
 * без авторизации, поэтому поля перечислены белым списком: черновики и
 * служебные флаги наружу не уезжают.
 */

/** Товар в том виде, в каком его видит витрина. */
export interface PublicProduct {
  id: string;
  slug: string;
  title: string;
  description: string;
  price: number;
  oldPrice: number | null;
  imageUrl: string;
  inStock: boolean;
  category: { slug: string; title: string };
}

/** Разделы каталога вместе с числом опубликованных товаров. */
export async function listCategories(): Promise<
  Array<{ id: string; slug: string; title: string; productCount: number }>
> {
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    select: {
      id: true,
      slug: true,
      title: true,
      // Счётчик считаем здесь, а не отдельным запросом с фронтенда: иначе
      // витрина сделала бы N+1 запрос ради одной цифры под названием раздела.
      _count: { select: { products: { where: { isPublished: true } } } },
    },
  });

  return categories.map((category) => ({
    id: category.id,
    slug: category.slug,
    title: category.title,
    productCount: category._count.products,
  }));
}

/** Постраничный список товаров с необязательным фильтром по разделу. */
export async function listProducts(query: ListProductsQuery): Promise<{
  items: PublicProduct[];
  total: number;
  limit: number;
  offset: number;
}> {
  const where = {
    isPublished: true,
    ...(query.category ? { category: { slug: query.category } } : {}),
  };

  /**
   * Список и общее число берём одной транзакцией.
   *
   * Между двумя независимыми запросами товар может появиться или исчезнуть,
   * и тогда «показано 12 из 11» — счётчик страниц начинает врать.
   */
  const [items, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      skip: query.offset,
      select: PUBLIC_PRODUCT_SELECT,
    }),
    prisma.product.count({ where }),
  ]);

  return {
    items: items.map(toPublicProduct),
    total,
    limit: query.limit,
    offset: query.offset,
  };
}

/** Карточка товара по slug. */
export async function getProductBySlug(slug: string): Promise<PublicProduct> {
  const product = await prisma.product.findUnique({
    where: { slug },
    select: { ...PUBLIC_PRODUCT_SELECT, isPublished: true },
  });

  // Черновик отдаём как 404, а не как 403: посетителю незачем знать,
  // что товар существует, но ещё не готов к показу.
  if (!product || !product.isPublished) {
    throw ApiError.notFound('Товар не найден');
  }

  return toPublicProduct(product);
}

/**
 * Явный white-list полей.
 *
 * Принципиально не делаю `const { isPublished, ...rest } = product`: при
 * добавлении нового служебного поля в модель такой спред молча утечёт его
 * в публичный API, а белый список — нет.
 */
const PUBLIC_PRODUCT_SELECT = {
  id: true,
  slug: true,
  title: true,
  description: true,
  price: true,
  oldPrice: true,
  imageUrl: true,
  inStock: true,
  category: { select: { slug: true, title: true } },
} as const;

function toPublicProduct(product: {
  id: string;
  slug: string;
  title: string;
  description: string;
  price: number;
  oldPrice: number | null;
  imageUrl: string;
  inStock: boolean;
  category: { slug: string; title: string };
}): PublicProduct {
  return {
    id: product.id,
    slug: product.slug,
    title: product.title,
    description: product.description,
    price: product.price,
    oldPrice: product.oldPrice,
    imageUrl: product.imageUrl,
    inStock: product.inStock,
    category: product.category,
  };
}
