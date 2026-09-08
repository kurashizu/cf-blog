<script lang="ts">
	/**
	 * The one button. Every clickable control in the chrome, the utilities and
	 * the synth panels is meant to be this component, so the look, the press
	 * feel, the focus ring and the click sound are decided once here.
	 *
	 * variant  outline  bordered in `color`, fills on hover (the default)
	 *          solid    filled with `color`, black text -- the primary action
	 *          neutral  white/20 border, lights up in `color` when `active`
	 *          ghost    text only, for [ Esc ] / [ x ] / inline verbs
	 *          link     underlined text
	 * active   a toggle's on-state; rendered as aria-pressed for the reader
	 * label    the accessible name for an icon-only or glyph-only button
	 * sound    click sound on press, or null for silence
	 */
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { playSound, type SoundEffectType } from '$lib/sound';

	let {
		variant = 'outline',
		color = '#56b6c2',
		size = 'sm',
		active,
		label,
		sound = 'click',
		type = 'button',
		class: cls = '',
		children,
		onclick,
		...rest
	}: {
		variant?: 'outline' | 'solid' | 'neutral' | 'ghost' | 'link';
		color?: string;
		size?: 'xs' | 'sm' | 'md' | 'lg';
		active?: boolean;
		label?: string;
		sound?: SoundEffectType | null;
		class?: string;
		children?: Snippet;
	} & HTMLButtonAttributes = $props();
</script>

<button
	{type}
	class="ui-btn press ui-btn-{size} ui-btn-{variant} {cls}"
	class:is-active={active}
	style="--ui: {color}"
	aria-pressed={active === undefined ? undefined : active}
	aria-label={label}
	onclick={(e) => {
		if (sound) playSound(sound);
		onclick?.(e);
	}}
	{...rest}
>
	{@render children?.()}
</button>
