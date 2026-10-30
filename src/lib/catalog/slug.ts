import { normalize } from '../normalize/text';

/** URL segment for an artist: the normalized name with spaces as hyphens. Stable across songbooks. */
export function artistSlug(name: string): string {
	return normalize(name).replaceAll(' ', '-') || 'unknown';
}
