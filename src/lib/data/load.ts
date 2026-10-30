import { readFile } from 'node:fs/promises';
import { AliasesFile, type Aliases } from '../normalize/credit';
import { normalize } from '../normalize/text';
import { CorrectionsFile } from './corrections';

async function readJson(path: string): Promise<unknown> {
	return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

export async function loadCorrections(path: string): Promise<CorrectionsFile> {
	return CorrectionsFile.parse(await readJson(path));
}

/** Alias keys must already be normalized, otherwise they would silently never match. */
export async function loadAliases(path: string): Promise<Aliases> {
	const aliases = AliasesFile.parse(await readJson(path));
	const bad = Object.keys(aliases.map).filter((key) => key !== normalize(key));
	if (bad.length > 0) {
		throw new Error(`aliases.json keys must be normalized: ${bad.join(', ')}`);
	}
	return aliases;
}
