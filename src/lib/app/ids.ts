/** DOM id of the nth option in a results listbox. Shared so the search box can name the active one. */
export function optionId(listId: string, index: number): string {
	return `${listId}-option-${String(index)}`;
}
