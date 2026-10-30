import { indexedDbCache } from './cache';
import { SearchEngine } from './engine';
import type { WorkerRequest, WorkerResponse } from './protocol';

interface WorkerScope {
	postMessage(message: WorkerResponse): void;
	onmessage: ((event: { data: WorkerRequest }) => void) | null;
}

const scope = self as unknown as WorkerScope;
const engine = new SearchEngine({
	fetchText: async (url) => {
		const response = await fetch(url);
		if (!response.ok) throw new Error(`GET ${url} returned ${String(response.status)}`);
		return response.text();
	},
	cache: indexedDbCache()
});

scope.onmessage = ({ data }) => {
	if (data.type === 'load') {
		engine.load(data.songbook).then(
			(loaded) => {
				scope.postMessage({ type: 'ready', ...loaded });
			},
			(error: unknown) => {
				scope.postMessage({ type: 'error', message: String(error) });
			}
		);
		return;
	}
	try {
		if (data.type === 'search') {
			const { hits, total } = engine.search(data.query, data.options);
			scope.postMessage({ type: 'results', id: data.id, total, hits });
		} else if (data.type === 'codes') {
			scope.postMessage({ type: 'songs', id: data.id, songs: engine.songsByCodes(data.codes) });
		} else {
			scope.postMessage({ type: 'releases', id: data.id, releases: engine.releases() });
		}
	} catch (error) {
		scope.postMessage({ type: 'error', id: data.id, message: String(error) });
	}
};
