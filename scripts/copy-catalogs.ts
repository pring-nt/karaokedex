import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const SOURCE_DIR = join('data', 'catalogs');
const STATIC_DIR = 'static';
const MANIFEST = 'catalog-manifest.json';

/** Serves the committed catalogs from `static/`. Without any, the site builds with an empty manifest. */
await mkdir(STATIC_DIR, { recursive: true });
for (const name of await readdir(STATIC_DIR)) {
	if (/^catalog\..+\.json$/.test(name) || name === MANIFEST) await rm(join(STATIC_DIR, name));
}

const names = existsSync(SOURCE_DIR) ? await readdir(SOURCE_DIR) : [];
for (const name of names) await copyFile(join(SOURCE_DIR, name), join(STATIC_DIR, name));
if (!names.includes(MANIFEST)) {
	await writeFile(join(STATIC_DIR, MANIFEST), JSON.stringify({ songbooks: [] }));
}
console.log(`copied ${String(names.length)} catalog files to ${STATIC_DIR}`);
