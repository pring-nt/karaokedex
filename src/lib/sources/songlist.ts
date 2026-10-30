import { parse, type Node } from 'acorn';
import { z } from 'zod';

const Link = z.url();
const MonthlyProduct = z.object({
	product: z.string().min(1),
	years: z.array(
		z.object({
			year: z.number().int(),
			months: z.array(z.object({ month: z.string().min(1), link: Link }))
		})
	)
});
const VolumeProduct = z.object({
	product: z.string().min(1),
	volumes: z.array(z.object({ volume: z.union([z.number(), z.string().min(1)]), link: Link }))
});
const SongList = z.array(z.union([MonthlyProduct, VolumeProduct]));

type MonthlyProduct = z.infer<typeof MonthlyProduct>;
type VolumeProduct = z.infer<typeof VolumeProduct>;
export type SongList = z.infer<typeof SongList>;

export class SongListError extends Error {}

const SONGLIST_PAGE = 'https://platinumkaraoke.com/pages/songlist-update';
const USER_AGENT = 'KaraokeDex source watcher (+https://github.com/pring-nt/karaokedex)';

const ASSET_URL = /(?:https?:)?\/\/[^"'\s<>]*\/assets\/songlist-update-data\.js\?v=[\w-]+/;

export interface AssetRef {
	url: string;
	version: string;
}

/** Finds the `songlist-update-data.js?v=...` script in the page HTML. The theme number in its path changes. */
export function findAsset(html: string, pageUrl: string = SONGLIST_PAGE): AssetRef {
	const match = ASSET_URL.exec(html);
	if (!match) {
		throw new SongListError('page structure changed: songlist-update-data.js script not found');
	}
	const url = new URL(match[0], pageUrl);
	const version = url.searchParams.get('v');
	if (!version) throw new SongListError('songlist asset URL has no ?v= version');
	url.search = '';
	return { url: url.toString(), version };
}

function keyName(node: Node & { key?: Node; computed?: boolean }): string {
	const key: (Node & { name?: string; value?: unknown }) | undefined = node.key;
	if (!key || node.computed) throw new SongListError('computed property keys are not allowed');
	if (key.type === 'Identifier' && typeof key.name === 'string') return key.name;
	if (key.type === 'Literal' && (typeof key.value === 'string' || typeof key.value === 'number')) {
		return String(key.value);
	}
	throw new SongListError(`unsupported property key ${key.type}`);
}

/**
 * Converts a literal-only AST to plain data. Any other node type is an error, so the remote file
 * is never executed and cannot smuggle behaviour into the result.
 */
function toPlain(node: Node): unknown {
	const any = node as Node & Record<string, unknown>;
	switch (node.type) {
		case 'ArrayExpression':
			return (any.elements as (Node | null)[]).map((element) => {
				if (!element) throw new SongListError('sparse arrays are not allowed');
				return toPlain(element);
			});
		case 'ObjectExpression': {
			const result: Record<string, unknown> = {};
			for (const property of any.properties as (Node & {
				kind?: string;
				method?: boolean;
				value: Node;
			})[]) {
				if (property.type !== 'Property' || property.kind !== 'init' || property.method) {
					throw new SongListError(`unsupported object member ${property.type}`);
				}
				result[keyName(property)] = toPlain(property.value);
			}
			return result;
		}
		case 'Literal': {
			const value = any.value;
			if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
			throw new SongListError(`unsupported literal at ${String(node.start)}`);
		}
		case 'TemplateLiteral': {
			const quasis = any.quasis as { value: { cooked: string | null } }[];
			if ((any.expressions as Node[]).length > 0 || quasis.length !== 1) {
				throw new SongListError('template literals with expressions are not allowed');
			}
			return quasis[0]?.value.cooked ?? '';
		}
		default:
			throw new SongListError(`unsupported ${node.type} at ${String(node.start)} in songList`);
	}
}

/** Parses the asset with acorn, locates the top-level `songList` declarator and validates its shape. */
export function parseSongList(source: string): SongList {
	let program: Node & { body?: (Node & { declarations?: unknown[] })[] };
	try {
		program = parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
	} catch (error) {
		throw new SongListError(`songlist asset is not valid JavaScript: ${String(error)}`);
	}

	for (const statement of program.body ?? []) {
		if (statement.type !== 'VariableDeclaration') continue;
		for (const declarator of statement.declarations as {
			id: Node & { name?: string };
			init: Node | null;
		}[]) {
			if (
				declarator.id.type === 'Identifier' &&
				declarator.id.name === 'songList' &&
				declarator.init
			) {
				const result = SongList.safeParse(toPlain(declarator.init));
				if (!result.success) {
					throw new SongListError(`songList has an unexpected shape: ${result.error.message}`);
				}
				return result.data;
			}
		}
	}
	throw new SongListError('songList declaration not found in the asset');
}

export type FetchLike = (
	url: string,
	init?: { headers?: Record<string, string> }
) => Promise<{
	ok: boolean;
	status: number;
	text(): Promise<string>;
}>;

async function get(fetcher: FetchLike, url: string): Promise<string> {
	const response = await fetcher(url, { headers: { 'user-agent': USER_AGENT } });
	if (!response.ok) throw new SongListError(`GET ${url} returned ${String(response.status)}`);
	return response.text();
}

/**
 * Two requests at most: the songlist page, then the data asset. When `knownVersion` matches the
 * asset version found on the page, the asset is not fetched and `songList` is `null`.
 */
export async function fetchSongList(
	fetcher: FetchLike,
	knownVersion?: string
): Promise<{ asset: AssetRef; songList: SongList | null }> {
	const asset = findAsset(await get(fetcher, SONGLIST_PAGE));
	if (knownVersion !== undefined && asset.version === knownVersion)
		return { asset, songList: null };
	const source = await get(fetcher, `${asset.url}?v=${asset.version}`);
	return { asset, songList: parseSongList(source) };
}
