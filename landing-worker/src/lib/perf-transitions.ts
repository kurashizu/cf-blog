import { fade as svelteFade, fly as svelteFly, scale as svelteScale } from 'svelte/transition';
import type { TransitionConfig } from 'svelte/transition';
import { get } from 'svelte/store';
import { performanceMode } from './stores/performance';

/**
 * Drop-in replacements for svelte/transition's fade/fly/scale that collapse
 * to a zero-duration, no-motion transition under performance mode. Needed
 * because these directives animate inline styles directly on the node --
 * CSS's `transition: none !important` (see app.css's data-perf block)
 * cannot reach them at all, so without this every {#if}/{#key}-gated panel
 * on the site would keep fading/flying/scaling in performance mode despite
 * the CSS kill switch covering everything else. duration: 0 rather than
 * omitting the transition function entirely -- the element still needs to
 * mount/unmount correctly, just without motion, and Svelte already treats
 * a zero-duration transition as an instant no-op.
 */
export function fade(node: Element, params: Parameters<typeof svelteFade>[1] = {}): TransitionConfig {
	if (get(performanceMode)) return { duration: 0 };
	return svelteFade(node, params);
}

export function fly(node: Element, params: Parameters<typeof svelteFly>[1] = {}): TransitionConfig {
	if (get(performanceMode)) return { duration: 0 };
	return svelteFly(node, params);
}

export function scale(node: Element, params: Parameters<typeof svelteScale>[1] = {}): TransitionConfig {
	if (get(performanceMode)) return { duration: 0 };
	return svelteScale(node, params);
}
