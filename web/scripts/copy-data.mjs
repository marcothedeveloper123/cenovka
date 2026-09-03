// Copy the canonical data the SPA actually fetches into the build output.
//
// `public/data` is a symlink to ../../data/canonical, which is right for the dev
// server but wrong for a build: Vite follows it and copies the whole directory,
// including the 53 MB uncompressed latest.json and gitignored per-day metrics
// files. That produced a 69 MB dist, over Cloudflare Pages' 25 MB per-file limit.
//
// So `publicDir` is disabled for builds (see vite.config.ts) and this script
// copies exactly the four gzipped files instead — about 10 MB in total.

import { copyFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../../data/canonical');
const OUT = resolve(here, '../dist/data');

/** `required` files fail the build when missing; the rest degrade at runtime. */
const FILES = [
  { name: 'latest.json.gz', required: true },
  { name: 'groups.json.gz', required: false },
  { name: 'coverage.json.gz', required: false },
  { name: 'reference.json.gz', required: false },
  { name: 'reference-members.json.gz', required: false },
];

const MAX_BYTES = 25 * 1024 * 1024; // Cloudflare Pages per-file ceiling

await mkdir(OUT, { recursive: true });

let total = 0;
const missing = [];
for (const { name, required } of FILES) {
  const from = join(SRC, name);
  let size;
  try {
    ({ size } = await stat(from));
  } catch {
    if (required) {
      console.error(`[copy-data] MISSING REQUIRED ${name} in ${SRC}`);
      console.error('[copy-data] run `npm run assemble` at the repo root first.');
      process.exit(1);
    }
    missing.push(name);
    continue;
  }
  if (size > MAX_BYTES) {
    console.error(`[copy-data] ${name} is ${(size / 1048576).toFixed(1)} MB, over the 25 MB limit.`);
    process.exit(1);
  }
  await copyFile(from, join(OUT, name));
  total += size;
  console.log(`[copy-data] ${name.padEnd(20)} ${(size / 1048576).toFixed(2)} MB`);
}

if (missing.length) console.log(`[copy-data] absent (SPA degrades gracefully): ${missing.join(', ')}`);
console.log(`[copy-data] ${(total / 1048576).toFixed(2)} MB total → dist/data`);
