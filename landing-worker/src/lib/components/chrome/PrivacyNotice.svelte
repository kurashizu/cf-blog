<script lang="ts">
	import { fade, scale } from '$lib/perf-transitions';
	import { cubicOut } from 'svelte/easing';
	import BoxHeader from './BoxHeader.svelte';
	import { resolvedTheme, THEME_STYLES } from '../../stores/theme';
	import { playSound } from '../../sound';

	let { onAgree }: { onAgree: () => void } = $props();

	let themeStyles = $derived(THEME_STYLES[$resolvedTheme]);

	function agree() {
		playSound('power');
		onAgree();
	}
</script>

<!-- Same modal shape as GlobalSettings/HotkeyOverlay -- translucent
     cardBgVideo-over-blur panel, BoxHeader, scrim -- but deliberately
     without any of their easy-dismiss paths (no click-outside, no Esc,
     no [X]): this is a consent gate, not a settings panel, so the only
     way out is the button that means "I read this." -->
<div class="fixed inset-0 z-[195] bg-black/70 backdrop-blur-[2px] flex items-start sm:items-center justify-center p-2 sm:p-6 overflow-y-auto" transition:fade={{ duration: 180 }}>
	<div
		class="w-full max-w-lg {themeStyles.cardBgVideo} border {themeStyles.border} rounded-sm shadow-[0_16px_48px_rgba(0,0,0,0.8)] font-mono my-auto"
		transition:scale={{ duration: 180, start: 0.96, opacity: 0, easing: cubicOut }}
	>
		<BoxHeader title="PRIVACY_NOTICE // KRSZ.IN" short="PRIVACY" class="text-xs sm:text-sm font-black px-3 py-2 border-b {themeStyles.border} {themeStyles.headerBgVideo} rounded-t-sm" style="color: {themeStyles.cursorColor}" />

		<div class="p-3 sm:p-4 space-y-3 text-xs sm:text-sm">
			<p class="text-white/70 leading-relaxed">
				No account, no tracking, no analytics. Theme, sound, and every setting live only in this
				browser's own storage and are never sent anywhere.
			</p>
			<div class="border border-[#e06c75]/40 bg-[#e06c75]/10 rounded-xs p-2.5">
				<p class="text-[#e06c75] font-bold leading-relaxed">
					The one exception is the Guestbook — a message posted there is sent to the server and
					shown publicly. It has its own confirmation next to the send button.
				</p>
			</div>
			<button
				onclick={agree}
				class="press w-full mt-1 px-6 py-2.5 border-2 border-[#98c379] bg-[#98c379]/15 text-[#98c379] rounded-xs text-sm font-black tracking-wide cursor-pointer hover:bg-[#98c379] hover:text-black transition-colors"
			>
				AGREE →
			</button>
		</div>
	</div>
</div>
