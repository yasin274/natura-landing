-- Natura: начальная схема магазина.
--
-- База общая на несколько проектов, поэтому ВСЕ объекты названы с префиксом
-- natura_ — без него таблица products столкнулась бы с таблицей соседнего
-- сервиса. По той же причине везде стоит IF NOT EXISTS: повторный прогон
-- миграции на общей базе не должен ничего ронять.

-- CreateEnum
DO $$
BEGIN
    CREATE TYPE "natura_order_status" AS ENUM ('NEW', 'CONFIRMED', 'DONE', 'CANCELLED');
EXCEPTION
    -- CREATE TYPE не поддерживает IF NOT EXISTS, поэтому единственный способ
    -- сделать миграцию повторяемой — поймать ошибку «тип уже есть».
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "natura_categories" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,

    CONSTRAINT "natura_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "natura_products" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "oldPrice" INTEGER,
    "categoryId" UUID NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "inStock" BOOLEAN NOT NULL DEFAULT true,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "natura_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "natura_orders" (
    "id" UUID NOT NULL,
    "customerName" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "comment" TEXT,
    "total" INTEGER NOT NULL,
    "status" "natura_order_status" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "natura_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "natura_order_items" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    -- Название и цена дублируются намеренно: заказ обязан помнить, о чём
    -- договорились, даже когда товар подорожает или уйдёт с витрины.
    "title" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "natura_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "natura_admin_users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "natura_admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "natura_categories_slug_key" ON "natura_categories"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "natura_products_slug_key" ON "natura_products"("slug");
CREATE INDEX IF NOT EXISTS "natura_products_categoryId_isPublished_idx" ON "natura_products"("categoryId", "isPublished");
CREATE INDEX IF NOT EXISTS "natura_products_createdAt_idx" ON "natura_products"("createdAt");
CREATE INDEX IF NOT EXISTS "natura_orders_status_createdAt_idx" ON "natura_orders"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "natura_order_items_orderId_idx" ON "natura_order_items"("orderId");
CREATE UNIQUE INDEX IF NOT EXISTS "natura_admin_users_email_key" ON "natura_admin_users"("email");

-- AddForeignKey
DO $$
BEGIN
    ALTER TABLE "natura_products"
        ADD CONSTRAINT "natura_products_categoryId_fkey"
        FOREIGN KEY ("categoryId") REFERENCES "natura_categories"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    -- ON DELETE CASCADE: позиции без заказа не имеют смысла и должны уходить вместе с ним.
    ALTER TABLE "natura_order_items"
        ADD CONSTRAINT "natura_order_items_orderId_fkey"
        FOREIGN KEY ("orderId") REFERENCES "natura_orders"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    -- ON DELETE RESTRICT: удалить товар, который уже кем-то заказан, нельзя —
    -- иначе история заказов потеряет связь с каталогом. Снимайте с витрины
    -- через isPublished = false.
    ALTER TABLE "natura_order_items"
        ADD CONSTRAINT "natura_order_items_productId_fkey"
        FOREIGN KEY ("productId") REFERENCES "natura_products"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
