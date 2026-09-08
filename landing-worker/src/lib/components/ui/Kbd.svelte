<script lang="ts">
	/** A key cap, as the keymap and the tours draw them. */
	import type { Snippet } from 'svelte';
	let { color = '#56b6c2', class: cls = '', children }: { color?: string; class?: string; children?: Snippet } = $props();
</script>

<kbd class="ui-kbd {cls}" style="--ui: {color}">{@render children?.()}</kbd>
