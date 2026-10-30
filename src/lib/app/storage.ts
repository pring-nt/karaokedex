import type { z } from 'zod';

/** The slice of `Storage` the app needs, so tests can pass a plain object. */
export interface KeyValueStore {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

/** `localStorage`, or `null` when it is missing or throws (private windows, blocked site data). */
export function browserStorage(): KeyValueStore | null {
	try {
		const store = globalThis.localStorage as Storage | undefined;
		if (!store) return null;
		store.getItem('karaokedex:probe');
		return store;
	} catch {
		return null;
	}
}

/** Reads and validates a stored JSON value. Anything missing, corrupt or invalid is the fallback. */
export function readJson<T>(
	store: KeyValueStore | null,
	key: string,
	schema: z.ZodType<T>,
	fallback: T
): T {
	try {
		const raw = store?.getItem(key);
		if (raw === null || raw === undefined) return fallback;
		const parsed = schema.safeParse(JSON.parse(raw));
		return parsed.success ? parsed.data : fallback;
	} catch {
		return fallback;
	}
}

/** Returns false instead of throwing when the store is unavailable or full. */
export function writeJson(store: KeyValueStore | null, key: string, value: unknown): boolean {
	try {
		if (!store) return false;
		store.setItem(key, JSON.stringify(value));
		return true;
	} catch {
		return false;
	}
}
