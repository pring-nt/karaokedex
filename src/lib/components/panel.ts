/** What a results panel lets its page do: move the highlight, open it and name it for the search box. */
export interface PanelHandle {
	move(delta: 1 | -1): void;
	openActive(): void;
	activeId(): string | undefined;
}
