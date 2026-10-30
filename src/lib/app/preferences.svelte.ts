import { Songbook } from '../songbooks';
import {
	clearQueue,
	clearRecents,
	emptyLibrary,
	Library,
	pushRecent,
	toggleFavorite,
	toggleQueued
} from './library';
import { browserStorage, readJson, writeJson, type KeyValueStore } from './storage';

type Theme = 'dark' | 'light';

const THEME_KEY = 'karaokedex:theme';
const SONGBOOK_KEY = 'karaokedex:songbook';
const LIBRARY_KEY = 'karaokedex:library';

/** Everything the app remembers in this browser. Call `init()` once on the client. */
class Preferences {
	theme = $state<Theme>('dark');
	songbook = $state<Songbook>('hdd');
	library = $state<Library>(emptyLibrary());
	private store: KeyValueStore | null = null;

	init(): void {
		this.store = browserStorage();
		const attribute = document.documentElement.getAttribute('data-theme');
		this.theme = attribute === 'light' ? 'light' : 'dark';
		this.songbook = readJson(this.store, SONGBOOK_KEY, Songbook, 'hdd');
		this.library = readJson(this.store, LIBRARY_KEY, Library, emptyLibrary());
	}

	setTheme(theme: Theme): void {
		this.theme = theme;
		document.documentElement.setAttribute('data-theme', theme);
		try {
			this.store?.setItem(THEME_KEY, theme);
		} catch {
			return;
		}
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
