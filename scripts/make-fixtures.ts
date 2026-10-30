import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { PDFDocument } from 'pdf-lib';

/** Copies the given 1-based pages of a PDF into a new, much smaller document. */
export async function cutPages(source: Uint8Array, pages: readonly number[]): Promise<Uint8Array> {
	const input = await PDFDocument.load(source);
	const output = await PDFDocument.create();
	for (const page of pages) {
		if (!Number.isInteger(page) || page < 1 || page > input.getPageCount()) {
			throw new Error(`page ${String(page)} is outside 1-${String(input.getPageCount())}`);
		}
	}
	const copied = await output.copyPages(
		input,
		pages.map((page) => page - 1)
	);
	for (const page of copied) output.addPage(page);
	return output.save();
}

if (import.meta.main) {
	const [from, to, ...pages] = process.argv.slice(2);
	if (!from || !to || pages.length === 0) {
		console.error('usage: bun scripts/make-fixtures.ts <source.pdf> <out.pdf> <page> [<page>...]');
		process.exit(1);
	}
	const cut = await cutPages(new Uint8Array(await readFile(from)), pages.map(Number));
	await mkdir(dirname(resolve(to)), { recursive: true });
	await writeFile(to, cut);
	console.log(`wrote ${to} (${String(cut.length)} bytes, pages ${pages.join(', ')})`);
}
