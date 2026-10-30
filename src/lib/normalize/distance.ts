/** Levenshtein distance that gives up early: returns `max + 1` once the distance must exceed `max`. */
export function boundedEditDistance(a: string, b: string, max: number): number {
	if (Math.abs(a.length - b.length) > max) return max + 1;
	let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
	for (let i = 1; i <= a.length; i++) {
		const current = [i];
		let rowMin = i;
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			const value = Math.min(
				(previous[j] ?? 0) + 1,
				(current[j - 1] ?? 0) + 1,
				(previous[j - 1] ?? 0) + cost
			);
			current.push(value);
			rowMin = Math.min(rowMin, value);
		}
		if (rowMin > max) return max + 1;
		previous = current;
	}
	return previous[b.length] ?? max + 1;
}
