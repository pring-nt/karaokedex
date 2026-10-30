import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import {
	applyDiff,
	diffManifest,
	manifestFromSeed,
	SourcesFile,
	toManifest,
	type Manifest
} from '../src/lib/sources/manifest';
import {
	fetchSongList,
	parseSongList,
	SongListError,
	type FetchLike
} from '../src/lib/sources/songlist';

const { values } = parseArgs({
	options: {
		write: { type: 'boolean', default: false },
		sources: { type: 'string', default: 'data/sources.json' },
		seed: { type: 'string', default: 'data/sources.seed.json' },
		'asset-file': { type: 'string' }
	}
});

const EXIT_CHANGES = 10;

async function readJson(path: string): Promise<unknown> {
	return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

const current = existsSync(values.sources)
	? SourcesFile.parse(await readJson(values.sources))
	: null;

const fetcher: FetchLike = async (url, init) => {
	const response = await fetch(url, init);
	return { ok: response.ok, status: response.status, text: () => response.text() };
};

let manifest: Manifest;
let asset: { url: string; version: string };
try {
	if (values['asset-file']) {
		const source = await readFile(values['asset-file'], 'utf8');
		manifest = toManifest(parseSongList(source));
		asset = { url: `file:///${values['asset-file'].replaceAll('\\', '/')}`, version: 'local' };
	} else {
		try {
			const fetched = await fetchSongList(fetcher, current?.asset.version);
			asset = fetched.asset;
			if (!fetched.songList) {
				console.log(`asset version ${asset.version} unchanged, nothing to do`);
				process.exit(0);
			}
			manifest = toManifest(fetched.songList);
		} catch (error) {
			if (error instanceof SongListError || current !== null || !existsSync(values.seed))
				throw error;
			console.warn(`site unreachable (${String(error)}); using ${values.seed}`);
			manifest = manifestFromSeed(await readJson(values.seed));
			asset = { url: 'seed', version: 'seed' };
		}
	}
} catch (error) {
	console.error(`sources:check failed: ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
}

const diff = diffManifest(current, manifest, asset.version);

for (const conflict of manifest.conflicts) console.log(`conflict: ${conflict}`);
for (const entry of diff.added) {
	console.log(`new        ${entry.songbook ?? entry.product} ${entry.label}  ${entry.url}`);
}
for (const change of diff.urlChanged)
	console.log(`link moved ${change.key}  ${change.from} -> ${change.to}`);
for (const entry of diff.removedUpstream) {
	console.log(`removed    ${entry.songbook ?? entry.product} ${entry.label} (kept locally)`);
}
for (const product of diff.unknownProducts) console.log(`unknown product: ${product}`);
if (diff.assetVersion)
	console.log(`asset version ${diff.assetVersion.from} -> ${diff.assetVersion.to}`);
console.log(diff.changed ? `${String(diff.added.length)} new entries` : 'no changes');

if (values.write && (diff.changed || diff.assetVersion || current === null)) {
	const next = applyDiff(current, diff, manifest, asset, new Date(), existsSync);
	await mkdir(dirname(values.sources), { recursive: true });
	await writeFile(values.sources, `${JSON.stringify(next, null, 2)}\n`);
	console.log(`wrote ${values.sources}`);
}

process.exit(diff.changed ? EXIT_CHANGES : 0);
