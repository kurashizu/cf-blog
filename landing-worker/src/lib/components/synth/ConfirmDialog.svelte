<script lang="ts">
	/**
	 * The question asked before something is thrown away.
	 *
	 * Amber rather than the cyan the other dialogs wear: this one is the only
	 * place the site asks you to lose work, and it should not look like the
	 * routine ones. CANCEL takes focus, so a stray Enter or Escape keeps what
	 * you have -- the safe answer is the default.
	 */
	import { onMount } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { t } from '$lib/i18n';
	import { playSound } from '../../sound';
	import { confirmRequest, resolveConfirm } from '../../stores/synth-confirm';

	/* Rendered under <body>: the menus that raise this sit inside transformed,
	   clipping panels, which would contain a fixed child.
	
	   One always-mounted host is portalled, and the dialog lives inside it.

	   The dialog animates in but not out. An outro left the node stuck at
	   opacity 0 indefinitely -- still in the DOM, still pointer-events:auto --
	   which parked an invisible panel over the middle of the page that ate
	   every click that landed on it. Closing is not worth animating if the
	   cost is a trap. */
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return {
			destroy() {
				node.remove();
			}
		};
	}

	let cancelBtn = $state<HTMLButtonElement | null>(null);

	function cancel() {
		playSound('click');
		resolveConfirm(false);
	}

	function accept() {
		resolveConfirm(true);
	}

	$effect(() => {
		if ($confirmRequest) cancelBtn?.focus();
	});

	onMount(() => {
		function onKey(e: KeyboardEvent) {
			if (!$confirmRequest) return;
			if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				cancel();
			}
		}
		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	});
</script>

<div use:portal class="contents">
	{#if $confirmRequest}
	<div class="fixed inset-0 z-[180] bg-black/70" onclick={cancel} role="presentation" in:fade={{ duration: 120 }}></div>
	<div
		class="fixed z-[190] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[360px] max-w-[92vw] bg-[#121417] border border-[#e5c07b]/60 rounded-xs shadow-[0_12px_32px_rgba(0,0,0,0.8)] p-3 text-xs font-mono"
		role="alertdialog"
		aria-modal="true"
		aria-label={$confirmRequest.title}
		in:scale={{ duration: 140, start: 0.95, opacity: 0, easing: cubicOut }}
	>
		<div class="flex items-center gap-1.5 pb-2 border-b border-white/10 mb-2">
			<span class="text-[#e5c07b] text-[10px] leading-none">{'▲'}</span>
			<span class="font-black text-[#e5c07b]">{$confirmRequest.title}</span>
		</div>

		<p class="text-white/70 leading-relaxed">{$confirmRequest.body}</p>

		<div class="flex items-center justify-end gap-1.5 mt-3">
			<button
				bind:this={cancelBtn}
				onclick={cancel}
				class="press px-3 py-0.5 border border-white/25 text-white/70 hover:border-white/60 hover:text-white rounded-xs text-[10px] font-bold cursor-pointer transition-colors"
			>
				{$t('synth.confirm.cancel')}
			</button>
			<button
				onclick={accept}
				class="press px-3 py-0.5 border border-[#e5c07b] bg-[#e5c07b] text-black rounded-xs text-[10px] font-black cursor-pointer hover:brightness-110"
			>
				{$confirmRequest.confirmLabel}
			</button>
		</div>
	</div>
	{/if}
</div>
