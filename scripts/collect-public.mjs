/**
 * Собирает статику лендинга в public/ для раздачи с CDN.
 *
 * Зачем отдельная папка, а не корень репозитория: если отдать Vercel корень,
 * наружу уедет и server/ с исходниками, и конфиги. Публиковать нужно ровно
 * то, что должен видеть посетитель, — список ниже закрытый.
 *
 * API при этом раздаёт не CDN, а сервис: в vercel.json на него уходит только
 * /api/*. Поэтому картинки и страницы отдаются быстро и без пробуждения
 * сервера, а бэкенд занимается своим делом.
 */

import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public');

/** Что уезжает посетителю. Всё остальное остаётся на сервере. */
const PUBLISH = ['index.html', 'privacy.html', 'assets', 'photos'];

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const entry of PUBLISH) {
  const from = join(root, entry);
  if (!existsSync(from)) {
    console.warn(`пропущено, нет на диске: ${entry}`);
    continue;
  }
  await cp(from, join(out, entry), { recursive: true });
  console.log(`скопировано: ${entry}`);
}

// Описание папки с фотографиями посетителю не нужно.
await rm(join(out, 'photos', 'README.md'), { force: true });

console.log('статика собрана в public/');
