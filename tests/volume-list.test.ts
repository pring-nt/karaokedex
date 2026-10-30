import { describe, expect, test } from 'bun:test';
import type { PdfPage, TextItem } from '../src/lib/parser/extract';
import { parseVolumeList } from '../src/lib/parser/profiles/volume-list';

const TITLE_FONT = 'title';
const CODE_FONT = 'code';

function item(str: string, x: number, y: number, font = TITLE_FONT, fontSize = 9): TextItem {
	return { str, x, y, width: str.length * 4, fontSize, font, hasEOL: false };
}

function row(title: string, code: string, artist: string, y: number): TextItem[] {
	return [item(title, 20, y), item(code, 120, y, CODE_FONT), item(artist, 160, y)];
}

function page(items: TextItem[], number = 1): PdfPage {
	return { number, width: 390, height: 674, items };
}

const header = [
	item('New Songs', 80, 617, TITLE_FONT, 11),
	item('Title', 20, 603),
	item('Code', 120, 603),
	item('Popularized By:', 160, 603)
];

describe('parseVolumeList', () => {
	test('drops the page number and footer stamps, which print before the first title', () => {
		const { rows } = parseVolumeList([
			page([
				item('2', 23, 26),
				item('Vol. 35', 180, 16),
				...header,
				...row('Empire', '16174', 'Shakira', 590),
				...row('Koro', '42291', 'Greyhoundz', 576)
			])
		]);
		expect(rows.map((song) => song.title)).toEqual(['Empire', 'Koro']);
	});

	test('keeps a song called Title and titles that start with a digit', () => {
		const { rows } = parseVolumeList([
			page([
				...header,
				...row('Title', '17373', 'Meghan Trainor', 590),
				...row('2U', '26229', 'David Guetta', 576),
				...row('4EVER', '29263', 'LANY', 562)
			])
		]);
		expect(rows.map((song) => song.title)).toEqual(['Title', '2U', '4EVER']);
	});

	test('keeps a row printed inside the usual footer band', () => {
		const { rows } = parseVolumeList([
			page([
				...header,
				...row('Hello', '10001', 'Adele', 590),
				...row('Nobody Loves Me Like You', '10002', 'Whitney Houston', 24)
			])
		]);
		expect(rows.map((song) => song.code)).toEqual(['10001', '10002']);
	});

	test('a code printed twice keeps its first row', () => {
		const { rows } = parseVolumeList([
			page([
				...header,
				...row('Macho Na Si Santa', '28289', 'Masculados', 590),
				...row('Macho Na Si Santa', '28289', 'Masculados', 576)
			])
		]);
		expect(rows).toHaveLength(1);
	});

	test('drops inline site links, regional headings and stamps', () => {
		const { rows } = parseVolumeList([
			page([
				...header,
				item('www.platinumkaraoke.ph', 20, 595),
				item('Waray Songs', 20, 592),
				...row('Hello', '10001', 'Adele', 590)
			])
		]);
		expect(rows.map((song) => song.title)).toEqual(['Hello']);
	});

	test('a file without the New Songs signature is rejected', () => {
		expect(() => parseVolumeList([page(row('Hello', '10001', 'Adele', 590))])).toThrow('New Songs');
	});
});
