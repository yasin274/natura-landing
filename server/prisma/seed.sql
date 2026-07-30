-- Natura: демо-наполнение каталога.
--
-- Запускать ПОСЛЕ migrations/0_init/migration.sql. Скрипт идемпотентный
-- (ON CONFLICT DO NOTHING по slug), поэтому повторный прогон ничего не портит
-- и не плодит дублей — это важно, потому что база общая и запускать его
-- будут вручную, возможно не раз.
--
-- gen_random_uuid() встроен в PostgreSQL начиная с 13-й версии, расширение
-- pgcrypto ставить не нужно.
--
-- Картинок в репозитории пока нет: пути ведут в photos/catalog/, и, пока
-- файлов там нет, лендинг показывает векторную заготовку вместо фотографии.

-- ── Разделы каталога ────────────────────────────────────────────────────────
-- sortOrder задан вручную: витрина должна начинаться с диванов, а не с буквы «Д».
INSERT INTO "natura_categories" ("id", "slug", "title", "sortOrder") VALUES
  (gen_random_uuid(), 'sofas',    'Диваны',      10),
  (gen_random_uuid(), 'chairs',   'Кресла',      20),
  (gen_random_uuid(), 'tables',   'Столы',       30),
  (gen_random_uuid(), 'beds',     'Кровати',     40),
  (gen_random_uuid(), 'storage',  'Хранение',    50),
  (gen_random_uuid(), 'lighting', 'Свет',        60),
  (gen_random_uuid(), 'decor',    'Декор',       70),
  (gen_random_uuid(), 'outdoor',  'Для улицы',   80)
ON CONFLICT ("slug") DO NOTHING;

-- ── Товары ──────────────────────────────────────────────────────────────────
-- Раздел ищем подзапросом по slug, а не хардкодим uuid: идентификаторы
-- генерируются выше случайно и заранее неизвестны.
INSERT INTO "natura_products"
  ("id", "slug", "title", "description", "price", "oldPrice", "categoryId", "imageUrl", "inStock", "isPublished", "createdAt")
VALUES
  (gen_random_uuid(), 'sofa-luna-3',
   'Диван «Луна», 3 места',
   'Трёхместный диван с мягкими подушками из холлофайбера и каркасом из массива бука. Обивка — рогожка плотностью 380 г/м², устойчивая к затяжкам.',
   89900, 105000, (SELECT "id" FROM "natura_categories" WHERE "slug" = 'sofas'),
   'photos/catalog/sofa-luna.jpg', true, true, NOW() - INTERVAL '1 day'),

  (gen_random_uuid(), 'sofa-nord-2',
   'Диван «Норд», 2 места',
   'Компактный двухместный диван для гостиной или кабинета. Съёмные чехлы стираются в машине при 30°.',
   64900, NULL, (SELECT "id" FROM "natura_categories" WHERE "slug" = 'sofas'),
   'photos/catalog/sofa-nord.jpg', true, true, NOW() - INTERVAL '2 days'),

  (gen_random_uuid(), 'chair-casa-lounge',
   'Кресло «Каса Лаунж»',
   'Лаунж-кресло с высокой спинкой и подлокотниками из ясеня. Наклон спинки 105° — комфортно для долгого чтения.',
   38900, 45900, (SELECT "id" FROM "natura_categories" WHERE "slug" = 'chairs'),
   'photos/catalog/chair-casa.jpg', true, true, NOW() - INTERVAL '3 days'),

  (gen_random_uuid(), 'chair-oslo',
   'Кресло «Осло»',
   'Каркас из гнутой фанеры, сиденье с эффектом памяти. Выдерживает нагрузку до 140 кг.',
   27500, NULL, (SELECT "id" FROM "natura_categories" WHERE "slug" = 'chairs'),
   'photos/catalog/chair-oslo.jpg', true, true, NOW() - INTERVAL '4 days'),

  (gen_random_uuid(), 'table-haven-180',
   'Обеденный стол «Хейвен», 180 см',
   'Столешница из массива дуба толщиной 40 мм, покрытие — натуральное масло с твёрдым воском. Рассчитан на шесть персон.',
   74900, NULL, (SELECT "id" FROM "natura_categories" WHERE "slug" = 'tables'),
   'photos/catalog/table-haven.jpg', true, true, NOW() - INTERVAL '5 days'),

  (gen_random_uuid(), 'table-coffee-orbit',
   'Журнальный стол «Орбита»',
   'Круглая столешница диаметром 90 см на трёх ножках из тонированного ясеня.',
   19900, 24500, (SELECT "id" FROM "natura_categories" WHERE "slug" = 'tables'),
   'photos/catalog/table-orbit.jpg', true, true, NOW() - INTERVAL '6 days'),

  (gen_random_uuid(), 'bed-sever-160',
   'Кровать «Север», 160×200',
   'Кровать с мягким изголовьем и ортопедическим основанием из берёзовых ламелей. Высота до основания — 30 см.',
   96900, 112000, (SELECT "id" FROM "natura_categories" WHERE "slug" = 'beds'),
   'photos/catalog/bed-sever.jpg', true, true, NOW() - INTERVAL '7 days'),

  (gen_random_uuid(), 'bed-mia-140',
   'Кровать «Миа», 140×200',
   'Лаконичная модель с подъёмным механизмом и коробом для белья объёмом 320 литров.',
   84900, NULL, (SELECT "id" FROM "natura_categories" WHERE "slug" = 'beds'),
   'photos/catalog/bed-mia.jpg', false, true, NOW() - INTERVAL '8 days'),

  (gen_random_uuid(), 'sideboard-milo',
   'Комод «Мило»',
   'Четыре ящика на доводчиках, фасады из шпона дуба. Габариты 120×45×80 см.',
   42900, NULL, (SELECT "id" FROM "natura_categories" WHERE "slug" = 'storage'),
   'photos/catalog/sideboard-milo.jpg', true, true, NOW() - INTERVAL '9 days'),

  (gen_random_uuid(), 'shelf-linea',
   'Стеллаж «Линеа»',
   'Открытый стеллаж на пять секций. Металлический каркас с порошковой окраской и полки из массива.',
   31500, 36000, (SELECT "id" FROM "natura_categories" WHERE "slug" = 'storage'),
   'photos/catalog/shelf-linea.jpg', true, true, NOW() - INTERVAL '10 days'),

  (gen_random_uuid(), 'lamp-sfera',
   'Торшер «Сфера»',
   'Напольный светильник с плафоном из матового стекла и основанием из латуни. Цоколь E27, диммируется.',
   14900, NULL, (SELECT "id" FROM "natura_categories" WHERE "slug" = 'lighting'),
   'photos/catalog/lamp-sfera.jpg', true, true, NOW() - INTERVAL '11 days'),

  (gen_random_uuid(), 'rug-terra-200',
   'Ковёр «Терра», 200×300',
   'Шерстяной ковёр ручной работы с коротким ворсом. Не электризуется, подходит для тёплого пола.',
   34900, 39900, (SELECT "id" FROM "natura_categories" WHERE "slug" = 'decor'),
   'photos/catalog/rug-terra.jpg', true, true, NOW() - INTERVAL '12 days'),

  (gen_random_uuid(), 'outdoor-set-piknik',
   'Комплект для террасы «Пикник»',
   'Стол и две скамьи из термоясеня. Обработка автоклавным маслом — можно оставлять под открытым небом.',
   58900, NULL, (SELECT "id" FROM "natura_categories" WHERE "slug" = 'outdoor'),
   'photos/catalog/outdoor-piknik.jpg', true, true, NOW() - INTERVAL '13 days')
ON CONFLICT ("slug") DO NOTHING;

-- ── Администратор ───────────────────────────────────────────────────────────
-- Намеренно НЕ создаётся здесь: пароль в репозитории — это пароль, которым
-- через неделю пользуется весь интернет. Как завести админа, описано
-- в server/README.md, раздел «Первый администратор».
