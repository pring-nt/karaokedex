/** Keep in sync with the inline script in `src/app.html`, which applies the font before first paint. */
export const FONTS = [
	{ id: 'modern', label: 'Modern' },
	{ id: 'editorial', label: 'Editorial' },
	{ id: 'friendly', label: 'Friendly' },
	{ id: 'readable', label: 'Readable' },
	{ id: 'typewriter', label: 'Typewriter' }
] as const;

export type FontId = (typeof FONTS)[number]['id'];

export const DEFAULT_FONT: FontId = 'modern';

export function parseFontPreference(saved: string | null): FontId {
	return FONTS.find((font) => font.id === saved)?.id ?? DEFAULT_FONT;
}
