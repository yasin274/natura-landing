import { z } from 'zod';

/**
 * Схемы публичного каталога.
 *
 * Вынесены в отдельный файл, а не в routes: выведенные из них типы нужны
 * и контроллеру, и сервису, а импортировать типы из файла с роутами —
 * значит развернуть зависимости в обратную сторону.
 */

/**
 * Slug ограничен латиницей, цифрами и дефисом.
 *
 * Это не косметика: slug подставляется в адрес и в WHERE-условие, а узкий
 * алфавит сразу отсекает попытки передать в него что-то экзотическое.
 */
export const slugSchema = z
  .string()
  .trim()
  .min(1, 'Укажите идентификатор товара')
  .max(120)
  .regex(/^[a-z0-9-]+$/, 'Идентификатор может содержать только латиницу, цифры и дефис');

export const productSlugParamsSchema = z.object({
  slug: slugSchema,
});

export const listProductsQuerySchema = z.object({
  /** Фильтр по разделу каталога. Пусто — показываем всё. */
  category: slugSchema.optional(),

  /**
   * Постраничность есть с самого начала, хотя товаров пока десяток:
   * дописывать её потом пришлось бы вместе с фронтендом, а отдавать разом
   * весь каталог — гарантированный тормоз на мобильном интернете.
   */
  limit: z.coerce.number().int().min(1).max(48).default(12),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ProductSlugParams = z.infer<typeof productSlugParamsSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
