import type { Song } from '../catalog/schema';
import type { ReleaseSummary, SearchOptions, SongHit } from '../search/engine';
import type { WorkerRequest, WorkerResponse } from '../search/protocol';
import type { Songbook } from '../songbooks';

type CatalogStatus = 'idle' | 'loading' | 'ready' | 'error';

interface SearchOutcome {
	songbook: Songbook;
	total: number;
	hits: SongHit[];
}

interface Waiter {
	resolve(response: WorkerResponse): void;
	reject(error: Error): void;
}

/**
 * Talks to the search worker. The worker is created on first use, in the browser only. Every
 * answer is tagged with the songbook it came from so a slow answer for the previous songbook can
 * never be shown after a switch.
 */
class CatalogClient {
	status = $state<CatalogStatus>('idle');
	songbook = $state<Songbook | null>(null);
	version = $state('');
	count = $state(0);
	otherCount = $state(0);
	error = $state('');

	private worker: Worker | null = null;
	private nextId = 1;
	private readonly waiting = new Map<number, Waiter>();
	private loading: Promise<void> | null = null;
	private loadWaiter: { songbook: Songbook; resolve(): void; reject(error: Error): void } | null =
		null;

	private async ensureWorker(): Promise<Worker> {
		if (this.worker) return this.worker;
		const { default: SearchWorker } = await import('../search/worker?worker');
		const worker = new SearchWorker();
		worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
			this.receive(event.data);
		};
		this.worker = worker;
		return worker;
	}

	private receive(message: WorkerResponse): void {
		if (message.type === 'ready') {
			if (this.loadWaiter?.songbook === message.songbook) {
				this.version = message.version;
				this.count = message.count;
				this.otherCount = message.otherCount;
				this.status = 'ready';
				this.loadWaiter.resolve();
				this.loadWaiter = null;
			}
			return;
		}
		if (message.type === 'error' && message.id === undefined) {
			this.error = message.message;
			this.status = 'error';
			this.loadWaiter?.reject(new Error(message.message));
			this.loadWaiter = null;
			return;
		}
		const id = message.type === 'error' ? message.id : message.id;
		const waiter = id === undefined ? undefined : this.waiting.get(id);
		if (!waiter || id === undefined) return;
		this.waiting.delete(id);
		if (message.type === 'error') waiter.reject(new Error(message.message));
		else waiter.resolve(message);
	}

	/** Loads a songbook, replacing the previous one. Calling it again for the same songbook is cheap. */
	load(songbook: Songbook): Promise<void> {
		if (this.songbook === songbook && this.status !== 'error' && this.loading) return this.loading;
		this.songbook = songbook;
		this.status = 'loading';
		this.error = '';
		const loading = this.ensureWorker().then(
			(worker) =>
				new Promise<void>((resolve, reject) => {
					this.loadWaiter = { songbook, resolve, reject };
					worker.postMessage({ type: 'load', songbook } satisfies WorkerRequest);
				})
		);
		this.loading = loading;
		loading.catch((error: unknown) => {
			if (this.songbook === songbook) {
				this.status = 'error';
				this.error = error instanceof Error ? error.message : String(error);
			}
		});
		return loading;
	}

	/** Forget the failed load and try the current songbook again. */
	retry(): Promise<void> {
		const songbook = this.songbook;
		this.loading = null;
		if (!songbook) return Promise.reject(new Error('no songbook selected'));
		return this.load(songbook);
	}

	private async request(message: (id: number) => WorkerRequest): Promise<WorkerResponse> {
		const loading = this.loading;
		if (!loading) throw new Error('no songbook loaded');
		await loading;
		const worker = await this.ensureWorker();
		const id = this.nextId++;
		return new Promise<WorkerResponse>((resolve, reject) => {
			this.waiting.set(id, { resolve, reject });
			worker.postMessage(message(id));
		});
	}

	async search(query: string, options: SearchOptions = {}): Promise<SearchOutcome> {
		const songbook = this.songbook;
		const response = await this.request((id) => ({ type: 'search', id, query, options }));
		if (response.type !== 'results' || !songbook) throw new Error('unexpected search response');
		return { songbook, total: response.total, hits: response.hits };
	}

	async songsByCodes(codes: string[]): Promise<{ songbook: Songbook; songs: Song[] }> {
		const songbook = this.songbook;
		const response = await this.request((id) => ({ type: 'codes', id, codes }));
		if (response.type !== 'songs' || !songbook) throw new Error('unexpected codes response');
		return { songbook, songs: response.songs };
	}

	async releases(): Promise<{ songbook: Songbook; releases: ReleaseSummary[] }> {
		const songbook = this.songbook;
		const response = await this.request((id) => ({ type: 'releases', id }));
		if (response.type !== 'releases' || !songbook) throw new Error('unexpected releases response');
		return { songbook, releases: response.releases };
	}
}

export const catalog = new CatalogClient();
