import { DEFAULT_SONGBOOK, Songbook } from '../songbooks';
import {
	clearQueue,
	clearRecents,
	emptyLibrary,
	Library,
	pushRecent,
	toggleFavorite,
	toggleQueued
} from './library';
import { DEFAULT_FONT, parseFontPreference, type FontId } from './fonts';
import { parseThemePreference, resolveTheme, themeMode, type ThemePreference } from './themes';
import { browserStorage, readJson, writeJson, type KeyValueStore } from './storage';

const THEME_KEY = 'karaokedex:theme';
const FONT_KEY = 'karaokedex:font';
const SONGBOOK_KEY = 'karaokedex:songbook';
const LIBRARY_KEY = 'karaokedex:library';

/** Everything the app remembers in this browser. Call `init()` once on the client. */
class Preferences {
	themePreference = $state<ThemePreference>('system');
	font = $state<FontId>(DEFAULT_FONT);
	songbook = $state<Songbook>(DEFAULT_SONGBOOK);
	library = $state<Library>(emptyLibrary());
	private store: KeyValueStore | null = null;
	private systemLight = false;

	init(): void {
		this.store = browserStorage();
		const lightQuery = window.matchMedia('(prefers-color-scheme: light)');
		this.systemLight = lightQuery.matches;
		this.themePreference = parseThemePreference(this.readString(THEME_KEY));
		this.font = parseFontPreference(this.readString(FONT_KEY));
		lightQuery.addEventListener('change', (event) => {
			this.systemLight = event.matches;
			this.applyTheme();
		});
		this.songbook = readJson(this.store, SONGBOOK_KEY, Songbook, DEFAULT_SONGBOOK);
		this.library = readJson(this.store, LIBRARY_KEY, Library, emptyLibrary());
	}

	private readString(key: string): string | null {
		try {
			return this.store?.getItem(key) ?? null;
		} catch {
			return null;
		}
	}

	private writeString(key: string, value: string): void {
		try {
			this.store?.setItem(key, value);
		} catch {
			return;
		}
	}

	private applyTheme(): void {
		const theme = resolveTheme(this.themePreference, this.systemLight);
		document.documentElement.setAttribute('data-theme', theme);
		document.documentElement.setAttribute('data-mode', themeMode(theme));
	}

	setThemePreference(preference: ThemePreference): void {
		this.themePreference = preference;
		this.applyTheme();
		this.writeString(THEME_KEY, preference);
	}

	setFont(font: FontId): void {
		this.font = font;
		document.documentElement.setAttribute('data-font', font);
		this.writeString(FONT_KEY, font);
	}

	setSongbook(songbook: Songbook): void {
		this.songbook = songbook;
		writeJson(this.store, SONGBOOK_KEY, songbook);
	}

	private update(next: Library): void {
		this.library = next;
		writeJson(this.store, LIBRARY_KEY, next);
	}

	toggleFavorite(code: string): void {
		this.update(toggleFavorite(this.library, this.songbook, code));
	}

	toggleQueued(code: string): void {
		this.update(toggleQueued(this.library, this.songbook, code));
	}

	clearQueue(): void {
		this.update(clearQueue(this.library, this.songbook));
	}

	addRecent(query: string): void {
		this.update(pushRecent(this.library, this.songbook, query));
	}

	clearRecents(): void {
		this.update(clearRecents(this.library, this.songbook));
	}
}

export const preferences = new Preferences();
