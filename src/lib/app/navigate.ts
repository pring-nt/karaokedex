import { goto } from '$app/navigation';

/**
 * Updates query parameters of the current URL in place, without a new history entry or a scroll.
 * The URL is built from the current one, so any base path is already part of it.
 */
export function patchSearch(
	current: { href: string },
	changes: Record<string, string | undefined>
): void {
	const url = new URL(current.href);
	for (const [name, value] of Object.entries(changes)) {
		if (value === undefined || value === '') url.searchParams.delete(name);
		else url.searchParams.set(name, value);
	}
	void goto(url, { shallow: true, replace: true });
}
