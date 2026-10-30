import type { Song } from '#lib/catalog/schema';

/** What a results panel lets its page do: move the highlight, open it and name it for the search box. */
export interface PanelHandle {
	move(delta: 1 | -1): void;
	openActive(): void;
	activeId(): string | undefined;
}

/** What a results table lets its panel read: the rows as displayed, after sorting and filtering. */
export interface TableHandle {
	count(): number;
	songAt(index: number): Song | undefined;
}
