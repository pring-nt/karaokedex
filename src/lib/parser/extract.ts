import { getDocumentProxy } from 'unpdf';

export interface TextItem {
	str: string;
	x: number;
	y: number;
	width: number;
	fontSize: number;
	/** Internal pdf.js font id. Only comparable within one document. */
	font: string;
	hasEOL: boolean;
}

export interface PdfPage {
	number: number;
	width: number;
	height: number;
	/** Text items in content-stream order, whitespace-only items included. */
	items: TextItem[];
}

/** Extracts text items with geometry and font, per page, from the PDF text layer (not the image). */
export async function extractPages(data: Uint8Array): Promise<PdfPage[]> {
	const pdf = await getDocumentProxy(data.slice());
	const pages: PdfPage[] = [];
	for (let number = 1; number <= pdf.numPages; number++) {
		const page = await pdf.getPage(number);
		const content = await page.getTextContent();
		const [left = 0, bottom = 0, right = 0, top = 0] = page.view;
		const items: TextItem[] = [];
		for (const item of content.items) {
			if (!('str' in item)) continue;
			items.push({
				str: item.str,
				x: item.transform[4] as number,
				y: item.transform[5] as number,
				width: item.width,
				fontSize: Math.abs(item.transform[0] as number),
				font: item.fontName,
				hasEOL: item.hasEOL
			});
		}
		pages.push({ number, width: right - left, height: top - bottom, items });
	}
	return pages;
}
