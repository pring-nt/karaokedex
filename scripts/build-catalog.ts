import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildCatalogs, type PdfInput } from '../src/lib/catalog/pipeline';
import { loadAliases, loadCorrections } from '../src/lib/data/load';
import { sourceSongbook, type Songbook } from '../src/lib/songbooks';
import { SourcesFile } from '../src/lib/sources/manifest';

/** Committed, so a deploy needs no PDFs. `catalog:copy` serves them from `static/`. */
const OUTPUT_DIR = join('data', 'catalogs');

/** PDFs the build uses: present files of every parsed list, plus any full list placed by hand. */
async function collectInputs(): Promise<PdfInput[]> {
	const inputs: PdfInput[] = [];
	const seen = new Set<string>();
	const add = async (songbook: Songbook, label: string, path: string) => {
		if (seen.has(path) || !existsSync(path)) return;
		seen.add(path);
		inputs.push({ songbook, label, data: new Uint8Array(await readFile(path)) });
	};

	if (existsSync('data/sources.json')) {
		const sources = SourcesFile.parse(JSON.parse(await readFile('data/sources.json', 'utf8')));
		for (const entry of sources.entries) {
			const songbook = sourceSongbook(entry.songbook);
			if (!songbook || !entry.file) continue;
			await add(songbook, entry.label, entry.file);
		}
	}
	if (existsSync(join('data', 'pdfs', 'p-series'))) {
		for (const name of await readdir(join('data', 'pdfs', 'p-series'))) {
			const label = name.replace(/\.pdf$/i, '');
			if (/^full-vol-\d+$/.test(label)) {
				await add('p-series', label, join('data', 'pdfs', 'p-series', name));
			}
		}
	}
	return inputs;
}

const inputs = await collectInputs();
if (inputs.length === 0) {
	console.error('catalog:update found no PDFs under data/pdfs; the catalogs were left as they are');
	process.exit(1);
}
const [aliases, corrections] = await Promise.all([
	loadAliases('data/aliases.json'),
	loadCorrections('data/corrections.json')
]);

const result = await buildCatalogs(inputs, {
	aliases,
	corrections,
	generatedAt: new Date().toISOString()
});

for (const report of result.reports) {
	const notes = [...report.errors.map((e) => `error: ${e}`)];
	if (notes.length > 0) console.error(`${report.songbook} ${report.label}: ${notes.join('; ')}`);
}
const flagged = result.reports.reduce((sum, report) => sum + report.needsReview, 0);

if (result.errors.length > 0) {
	for (const error of result.errors) console.error(error);
	console.error(`\ncatalog:update failed with ${String(result.errors.length)} error(s)`);
	process.exit(1);
}

await rm(OUTPUT_DIR, { recursive: true, force: true });
await mkdir(OUTPUT_DIR, { recursive: true });
for (const { file, json } of result.catalogs) await writeFile(join(OUTPUT_DIR, file), json);
if (result.shared) await writeFile(join(OUTPUT_DIR, result.shared.file), result.shared.json);
await writeFile(join(OUTPUT_DIR, 'catalog-manifest.json'), JSON.stringify(result.manifest));

for (const entry of result.manifest.songbooks) {
	console.log(
		`${entry.slug}: ${String(entry.count)} songs, version ${entry.version}, ${entry.file}`
	);
}
console.log(`${String(inputs.length)} PDFs, ${String(flagged)} rows flagged for review`);
