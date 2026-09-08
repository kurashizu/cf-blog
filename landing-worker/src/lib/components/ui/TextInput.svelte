<script lang="ts">
	/**
	 * A labelled text field. The label is always in the DOM and always bound
	 * to the input; `labelHidden` keeps it for the reader only when the
	 * surrounding layout already shows what the field is.
	 */
	import type { HTMLInputAttributes } from 'svelte/elements';

	let {
		value = $bindable(''),
		label,
		labelHidden = false,
		color = '#56b6c2',
		class: cls = '',
		inputClass = '',
		...rest
	}: {
		value?: string;
		label: string;
		labelHidden?: boolean;
		color?: string;
		class?: string;
		inputClass?: string;
	} & HTMLInputAttributes = $props();

	const id = $props.id();
</script>

<div class="flex flex-col gap-0.5 min-w-0 {cls}">
	<label for={id} class={labelHidden ? 'sr-only' : 'text-xs font-bold text-white/60'}>{label}</label>
	<input {id} bind:value class="ui-input {inputClass}" style="--krsz-focus-color: {color}" {...rest} />
</div>
