import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import routes from './routes/index.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { notFound } from './middlewares/notFound.js';
import { corsOrigin, env } from './config/env.js';

/**
 * Сборка Express-приложения.
 *
 * Вынесено отдельно от server.ts намеренно: здесь приложение только
 * конфигурируется, но не слушает порт. Благодаря этому его можно поднять
 * в тестах (supertest) без реального сокета.
 */
const app = express();

// За реверс-прокси (nginx, Render, Railway) — чтобы req.ip был настоящим,
// иначе лимитер запросов увидит один и тот же адрес прокси у всех посетителей.
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(cors({ origin: corsOrigin() }));
app.use(express.json({ limit: '256kb' }));

app.use('/api', routes);

/**
 * Раздача лендинга тем же процессом.
 *
 * Так index.html и API живут на одном origin, и фронтенду не нужно ни знать
 * адрес сервера, ни проходить preflight CORS — достаточно относительного
 * пути /api/... Отключается переменной SERVE_STATIC=false, если статику
 * раздаёт nginx или CDN.
 *
 * Путь ищем от файла, а не от process.cwd(): рабочий каталог зависит от
 * способа запуска (npm start из server/, systemd из корня, контейнер из /app),
 * и проверка по cwd молча не срабатывала бы, отдавая 404 вместо страницы.
 */
const here = path.dirname(fileURLToPath(import.meta.url));

// dist/app.js → server/dist → server → корень репозитория (для tsx: src → server → корень).
const repoRoot = path.resolve(here, '..', '..');

/**
 * Где искать статику.
 *
 * `public/` идёт первой: её собирает `npm run build`, и в развёртывании на
 * Vercel только она и существует — их сборщик кладёт в сервис лишь то, что
 * прослеживается из точки входа, поэтому папка перечислена в `includeFiles`.
 * Корень репозитория — запасной вариант для локального запуска, где сборку
 * статики никто не делал.
 */
const landingRoot = [path.join(repoRoot, 'public'), repoRoot].find((dir) =>
  existsSync(path.join(dir, 'index.html')),
);

/**
 * Строка в журнал при старте.
 *
 * Без неё «страница не открывается» превращается в гадание: раздача статики
 * зависит от переменной и от того, куда легли файлы при развёртывании, а
 * снаружи это неотличимо от обычного 404.
 */
console.log(
  `[статика] SERVE_STATIC=${env.SERVE_STATIC} корень=${repoRoot} папка=${landingRoot ?? 'НЕ НАЙДЕНА'}`,
);

if (env.SERVE_STATIC && landingRoot) {
  app.use(express.static(landingRoot, { maxAge: '1h', index: 'index.html' }));
}

// Порядок критичен: сначала 404, потом обработчик ошибок — иначе errorHandler
// не увидит ошибки, а 404 перехватит вообще всё.
app.use(notFound);
app.use(errorHandler);

export default app;
