import { describe, expect, test } from 'bun:test';
import { scanSource } from '../scripts/check-tokens';

const scan = (source: string) => scanSource('src/lib/components/Example.svelte', source);

describe('scanSource', () => {
	test('flags a planted hex color', () => {
		const [violation] = scan('<div style="color: #fff"></div>');
		expect(violation.rule).toBe('color');
		expect(violation.line).toBe(1);
	});

	test('flags rgb and oklch literals', () => {
		expect(scan('a { color: rgb(0 0 0 / 0.5); }')).toHaveLength(1);
		expect(scan('a { color: oklch(0.5 0 0); }')).toHaveLength(1);
	});

	test('flags raw radii, including Tailwind arbitrary values', () => {
		expect(scan('a { border-radius: 12px; }')[0].rule).toBe('radius');
		expect(scan('<div class="rounded-[10px]"></div>')[0].rule).toBe('radius');
	});

	test('flags raw durations', () => {
		expect(scan('a { transition: opacity 200ms ease; }')[0].rule).toBe('duration');
		expect(scan('<div class="duration-[300ms]"></div>')[0].rule).toBe('duration');
		expect(scan('animate(el, { duration: 300 });')[0].rule).toBe('duration');
	});

	test('allows tokens, color-mix, Svelte blocks, entities and the #lib alias', () => {
		const clean = [
			'a { color: var(--accent); border-radius: var(--radius-xl); }',
			'a { transition: opacity var(--dur-fast) var(--ease-snappy); }',
			'a { background: color-mix(in srgb, var(--accent) 15%, transparent); }',
			'{#each items as item (item.id)}{/each}',
			'<p>&#123; literal</p>',
			"import { cn } from '#lib/utils';",
			'<a href="#main" class="rounded-xl"></a>'
		];
		for (const line of clean) {
			expect(scan(line)).toEqual([]);
		}
	});

	test('reports one-based line numbers', () => {
		const [violation] = scan('ok\nok\na { color: #abc; }');
		expect(violation.line).toBe(3);
	});
});
