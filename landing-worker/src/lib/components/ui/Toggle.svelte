<script lang="ts">
	/**
	 * An ON / OFF switch, the way Global Settings draws one: a small bordered
	 * pill that lights up in `color` when on. role="switch" so a reader says
	 * "on/off" rather than "pressed", and `label` names what is switched --
	 * required, since the visible text is only ON or OFF.
	 */
	import { t } from '$lib/i18n';
	import { playSound } from '$lib/sound';

	let {
		checked,
		onchange,
		label,
		color = '#98c379',
		onText,
		offText,
		disabled = false,
		class: cls = ''
	}: {
		checked: boolean;
		onchange: (next: boolean) => void;
		label: string;
		color?: string;
		onText?: string;
		offText?: string;
		disabled?: boolean;
		class?: string;
	} = $props();
</script>

<button
	type="button"
	role="switch"
	aria-checked={checked}
	aria-label={label}
	{disabled}
	class="ui-btn press ui-btn-sm ui-btn-neutral shrink-0 {cls}"
	class:is-active={checked}
	style="--ui: {color}"
	onclick={() => {
		playSound('toggle');
		onchange(!checked);
	}}
>
	{checked ? (onText ?? $t('common.on')) : (offText ?? $t('common.off'))}
</button>
