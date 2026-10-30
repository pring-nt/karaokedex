import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import { loadCorrections } from '../src/lib/data/load';
import { parseRelease } from '../src/lib/parser/parse-release';
import type { ParsedRelease } from '../src/lib/parser/schema';
import { crossReleaseWarnings } from '../src/lib/parser/validate';
import { Songbook, sourceSongbook } from '../src/lib/songbooks';
import { entryKey, expectedFile, SourcesFile, type SourceEntry } from '../src/lib/sources/manifest';

const { values } = parseArgs({
	options: {
		songbook: { type: 'string' },
		sources: { type: 'string', default: 'data/sources.json' },
		write: { type: 'boolean', default: false }
	}
});

interface Row {
	entry: SourceEntry;
	rows?: number;
	review?: number;
	note?: string;
	release?: ParsedRelease;
}

const corrections = await loadCorrections('data/corrections.json');
const file = SourcesFile.parse(JSON.parse(await readFile(values.sources, 'utf8')) as unknown);
const selected = file.entries.filter(
	(entry) => !values.songbook || entry.songbook === values.songbook
);

const report: Row[] = [];
for (const listed of selected) {
	const path = expectedFile(listed);
	if (path === null) {
		report.push({ entry: { ...listed, status: 'ignored' } });
		continue;
	}
	if (!existsSync(path)) {
		report.push({ entry: { ...listed, status: 'missing', file: path, sha256: undefined } });
		continue;
	}

	const data = new Uint8Array(await readFile(path));
	const entry: SourceEntry = {
		...listed,
		status: 'present',
		file: path,
		sha256: createHash('sha256').update(data).digest('hex')
	};
	const book = sourceSongbook(listed.songbook);
	if (!book || book === 'p-series') {
		report.push({ entry, note: 'no parser profile for this volume yet' });
		continue;
	}
	try {
		const result = await parseRelease({
			songbook: book,
			label: listed.label,
			data,
			corrections
		});
		const flagged = result.release.rows.filter((row) => row.needsReview).length;
		if (result.errors.length === 0) {
			report.push({
				entry: { ...entry, status: 'parsed' },
				rows: result.release.rows.length,
				review: flagged,
				release: result.release
			});
		} else {
			report.push({
				entry,
				rows: result.release.rows.length,
				review: flagged,
				note: result.errors[0]
			});
		}
	} catch (error) {
		report.push({ entry, note: error instanceof Error ? error.message : String(error) });
	}
}

const pad = (text: string, width: number) => text.padEnd(width);
console.log(
	`${pad('label', 12)}${pad('status', 9)}${pad('file', 30)}${pad('rows', 6)}${pad('review', 8)}note`
);
for (const { entry, rows, review, note } of report) {
	console.log(
		pad(entry.label, 12) +
			pad(entry.status, 9) +
			pad(entry.file ? basename(entry.file) : '-', 30) +
			pad(rows === undefined ? '-' : String(rows), 6) +
			pad(review === undefined ? '-' : String(review), 8) +
			(note ?? '')
	);
}

const counts = new Map<string, number>();
for (const { entry } of report) counts.set(entry.status, (counts.get(entry.status) ?? 0) + 1);
console.log(`\n${[...counts].map(([status, count]) => `${String(count)} ${status}`).join(', ')}`);

const parsedReleases = report.flatMap(({ release }) => (release ? [release] : []));
if (parsedReleases.length > 1) {
	const seen = new Map<string, number>();
	for (const release of parsedReleases) {
		for (const row of release.rows)
			seen.set(
				`${release.songbook}:${row.code}`,
				(seen.get(`${release.songbook}:${row.code}`) ?? 0) + 1
			);
	}
	const repeated = [...seen.values()].filter((count) => count > 1).length;
	const lineage = crossReleaseWarnings(parsedReleases);
	console.log(
		`lineage: ${String(lineage.length)} releases whose main run does not follow the previous one; ${String(repeated)} codes listed by more than one release`
	);
	for (const warning of lineage.slice(0, 10)) console.log(`  ${warning}`);
	if (lineage.length > 10) console.log(`  ... ${String(lineage.length - 10)} more`);
}

const listedFiles = new Set(file.entries.map(expectedFile));
for (const songbook of Songbook.options.filter(
	(slug) => !values.songbook || slug === values.songbook
)) {
	const dir = `data/pdfs/${songbook}`;
	if (!existsSync(dir)) continue;
	for (const name of await readdir(dir)) {
		if (!listedFiles.has(`${dir}/${name}`)) console.log(`unlisted file: ${dir}/${name}`);
	}
}

if (values.write) {
	const updated = new Map(report.map(({ entry }) => [entryKey(entry), entry]));
	const next = {
		...file,
		entries: file.entries.map((entry) => updated.get(entryKey(entry)) ?? entry)
	};
	await writeFile(values.sources, `${JSON.stringify(next, null, 2)}\n`);
	console.log(`wrote ${values.sources}`);
}
