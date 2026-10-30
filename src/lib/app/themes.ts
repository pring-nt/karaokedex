/** Keep in sync with the inline script in `src/app.html`, which applies the theme before first paint. */
export const THEMES = [
	{ id: 'rose-pine', label: 'Rosé Pine', mode: 'dark' },
	{ id: 'rose-pine-moon', label: 'Rosé Pine Moon', mode: 'dark' },
	{ id: 'rose-pine-dawn', label: 'Rosé Pine Dawn', mode: 'light' },
	{ id: 'catppuccin-mocha', label: 'Catppuccin Mocha', mode: 'dark' },
	{ id: 'catppuccin-latte', label: 'Catppuccin Latte', mode: 'light' },
	{ id: 'tokyo-night', label: 'Tokyo Night', mode: 'dark' },
	{ id: 'gruvbox-dark', label: 'Gruvbox Dark', mode: 'dark' },
	{ id: 'nord', label: 'Nord', mode: 'dark' }
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];
export type ThemePreference = ThemeId | 'system';

/** Values saved before presets existed, when the only choices were dark and light. */
const LEGACY: Record<string, ThemeId> = { dark: 'rose-pine', light: 'rose-pine-dawn' };

export function parseThemePreference(saved: string | null): ThemePreference {
	if (saved === null) return 'system';
	if (Object.hasOwn(LEGACY, saved)) return LEGACY[saved];
	return THEMES.find((theme) => theme.id === saved)?.id ?? 'system';
}

export function resolveTheme(preference: ThemePreference, systemLight: boolean): ThemeId {
	if (preference !== 'system') return preference;
	return systemLight ? 'rose-pine-dawn' : 'rose-pine';
}

export function themeMode(id: ThemeId): 'dark' | 'light' {
	return THEMES.find((theme) => theme.id === id)?.mode ?? 'dark';
}
