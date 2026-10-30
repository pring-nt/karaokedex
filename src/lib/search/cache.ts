import type { CatalogCache } from './engine';

const DATABASE = 'karaokedex';
const STORE = 'catalogs';

function request<T>(action: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		action.onsuccess = () => {
			resolve(action.result);
		};
		action.onerror = () => {
			reject(action.error ?? new Error('IndexedDB request failed'));
		};
	});
}

function openDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const opening = indexedDB.open(DATABASE, 1);
		opening.onupgradeneeded = () => {
			opening.result.createObjectStore(STORE);
		};
		opening.onsuccess = () => {
			resolve(opening.result);
		};
		opening.onerror = () => {
			reject(opening.error ?? new Error('could not open IndexedDB'));
		};
	});
}

/**
 * IndexedDB-backed cache, one entry per catalog hash. IndexedDB can be missing or blocked
 * (private windows, cleared site data), so every failure degrades to "not cached".
 */
export function indexedDbCache(): CatalogCache {
	let opened: Promise<IDBDatabase> | null = null;
	const database = () => (opened ??= openDatabase());

	return {
		async get(hash) {
			try {
				const db = await database();
				const value: unknown = await request(
					db.transaction(STORE, 'readonly').objectStore(STORE).get(hash)
				);
				return typeof value === 'string' ? value : undefined;
			} catch {
				return undefined;
			}
		},
		async put(hash, json) {
			try {
				const db = await database();
				await request(db.transaction(STORE, 'readwrite').objectStore(STORE).put(json, hash));
			} catch {
				return;
			}
		}
	};
}
