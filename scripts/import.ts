import { mkdir, readdir, readFile, rename } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { loadAliases, loadCorrections } from '../src/lib/data/load';
import { createDb } from '../src/lib/db';
import { writeRelease } from '../src/lib/db/write';
import { parseRelease } from '../src/lib/parser/parse-release';
import type { ParsedRelease } from '../src/lib/parser/schema';
import { crossReleaseWarnings } from '../src/lib/parser/validate';
import { splitCredit } from '../src/lib/normalize/credit';
import { normalize } from '../src/lib/normalize/text';
import { nearDuplicateArtists } from '../src/lib/parser/full-list-rules';
import { SONGBOOKS, sourceSongbook } from '../src/lib/songbooks';

const USAGE =
	'usage: bun run import <pdf> [--songbook hdd] [--label YYYY-MM] [--db data/karaokedex.sqlite] [--yes]';

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		songbook: { type: 'string' },
		label: { type: 'string' },
		db: { type: 'string', default: 'data/karaokedex.sqlite' },
		yes: { type: 'boolean', default: false }
	}
});

function fail(message: string): never {
	console.error(message);
	process.exit(1);
}

const [input] = positionals;
if (!input) fail(USAGE);
const pdfPath = resolve(input);

const book =
	sourceSongbook(values.songbook ?? basename(dirname(pdfPath))) ??
	fail(`cannot infer the songbook from the path; pass --songbook\n${USAGE}`);

const monthly = SONGBOOKS[book].kind === 'monthly';
const LABEL = monthly ? /^\d{4}-\d{2}$/ : /^(?:full-)?vol-\d+(?:-\d+)?$/;
const stem = basename(pdfPath).replace(/\.pdf$/i, '');
const label = values.label ?? stem;
if (!LABEL.test(label)) {
	fail(
		`"${stem}" is not a ${monthly ? 'YYYY-MM' : 'full-vol-N'} file name; pass --label\n${USAGE}`
	);
}

const data = new Uint8Array(await readFile(pdfPath));
const [aliases, corrections] = await Promise.all([
	loadAliases('data/aliases.json'),
	loadCorrections('data/corrections.json')
]);
const result = await parseRelease({ songbook: book, label, data, corrections });
const release = result.release;

async function siblingReleases(): Promise<ParsedRelease[]> {
	const siblings: ParsedRelease[] = [];
	if (!monthly) return siblings;
	for (const name of await readdir(dirname(pdfPath))) {
		const siblingLabel = name.replace(/\.pdf$/i, '');
		if (!LABEL.test(siblingLabel) || siblingLabel === label) continue;
		const bytes = new Uint8Array(await readFile(join(dirname(pdfPath), name)));
		siblings.push(
			(await parseRelease({ songbook: book, label: siblingLabel, data: bytes, corrections }))
				.release
		);
	}
	return siblings;
}

const gapWarnings = crossReleaseWarnings([...(await siblingReleases()), release]).filter(
	(warning) => warning.includes(label)
);
const flagged = release.rows.filter((row) => row.needsReview);

const byReason = new Map<string, typeof flagged>();
for (const row of flagged) {
	for (const reason of row.reviewReasons)
		byReason.set(reason, [...(byReason.get(reason) ?? []), row]);
}
const alias = (name: string) => aliases.map[normalize(name)] ?? name;
const artistNames = release.rows.flatMap((row) =>
	splitCredit(row.creditRaw, aliases).map((artist) => artist.name)
);
const nearDuplicates = nearDuplicateArtists(artistNames, alias);

console.log(`songbook   ${release.songbook}`);
console.log(`release    ${release.label} (${release.profile}, ${String(result.columns)} columns)`);
console.log(`rows       ${String(release.rows.length)}`);
console.log(`range      ${release.codeMin}-${release.codeMax}`);
console.log(
	`alt titles ${String(release.rows.filter((row) => row.altTitles.length > 0).length)} songs`
);
if (monthly) console.log(`contiguous ${result.errors.length === 0 ? 'yes' : 'NO'}`);
for (const error of result.errors) console.log(`  error: ${error}`);
for (const warning of [...gapWarnings, ...result.warnings].slice(0, 20)) {
	console.log(`  warning: ${warning}`);
}
if (result.warnings.length > 20)
	console.log(`  ... ${String(result.warnings.length - 20)} more warnings`);
console.log(`needs review: ${String(flagged.length)}`);
for (const [reason, rows] of byReason) {
	console.log(`  ${reason} (${String(rows.length)})`);
	for (const row of rows) console.log(`    ${row.code} ${row.title} | ${row.creditRaw}`);
}
if (nearDuplicates.length > 0) {
	console.log(
		`near-duplicate artists (${String(nearDuplicates.length)}), add aliases if they are the same:`
	);
	for (const [a, b] of nearDuplicates) console.log(`  ${a} / ${b}`);
}

if (result.errors.length > 0) fail('\nrefusing to import a release with errors');

if (!values.yes) {
	const prompt = createInterface({ input: process.stdin, output: process.stdout });
	const answer = await prompt.question('\nImport this release? [y/N] ');
	prompt.close();
	if (!/^y(es)?$/i.test(answer.trim())) fail('aborted');
}

const target = join(resolve('data', 'pdfs', book), `${label}.pdf`);
if (resolve(pdfPath) !== target && values.label) {
	await mkdir(dirname(target), { recursive: true });
	await rename(pdfPath, target);
	console.log(`renamed to ${target}`);
}

const outcome = writeRelease(createDb(values.db), release, aliases);
console.log(
	outcome === 'skipped'
		? `skipped: ${release.label} is already in ${values.db} (same file hash)`
		: `imported ${release.label} into ${values.db}`
);
