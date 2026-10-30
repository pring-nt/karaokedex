import { animate, stagger } from 'animejs';
import type { Action } from 'svelte/action';

/** Entrances animate at most this many items; beyond it the group appears as one. */
const MAX_STAGGERED = 6;

function reduced(): boolean {
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Reads a duration token such as `--dur-enter` (`500ms`) from the document, in milliseconds. */
function token(name: string): number {
	const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
	const amount = Number.parseFloat(value);
	return Number.isFinite(amount) ? amount : 0;
}

/** Fade-up entrance for the first few children, staggered by `--stagger`. */
export const staggerIn: Action = (node) => {
	if (reduced()) return;
	const targets = [...node.children].slice(0, MAX_STAGGERED);
	if (targets.length === 0) return;
	const animation = animate(targets, {
		opacity: [0, 1],
		translateY: [16, 0],
		duration: token('--dur-enter'),
		delay: stagger(token('--stagger')),
		ease: 'outQuart'
	});
	return {
		destroy() {
			animation.revert();
		}
	};
};

/** Bottom sheet or modal entrance: fade plus a short slide, at drawer speed. */
export const sheetIn: Action = (node) => {
	if (reduced()) return;
	const animation = animate(node, {
		opacity: [0, 1],
		translateY: [24, 0],
		duration: token('--dur-slow'),
		ease: 'outQuart'
	});
	return {
		destroy() {
			animation.revert();
		}
	};
};

/** Short scale pulse used to confirm a copy. */
export function pulse(node: Element): void {
	if (reduced()) return;
	animate(node, {
		scale: [1, 1.08, 1],
		duration: token('--dur-base'),
		ease: 'outQuart'
	});
}
