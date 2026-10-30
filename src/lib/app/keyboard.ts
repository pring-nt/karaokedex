/**
 * Svelte action that keeps a bottom-fixed element above the on-screen keyboard, for browsers where
 * the keyboard covers the page instead of resizing it, such as iOS Safari.
 */
export function aboveKeyboard(element: HTMLElement): { destroy(): void } {
	const viewport = window.visualViewport;
	if (!viewport) return { destroy: () => undefined };

	const update = () => {
		const covered = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
		element.style.transform = covered > 0 ? `translateY(-${String(covered)}px)` : '';
	};
	viewport.addEventListener('resize', update);
	viewport.addEventListener('scroll', update);
	return {
		destroy: () => {
			viewport.removeEventListener('resize', update);
			viewport.removeEventListener('scroll', update);
		}
	};
}
