<script lang="ts">
	import { TAB_TITLES } from '$lib/routes-map';
	import X86SimView from '$lib/components/x86sim/X86SimView.svelte';
</script>

<svelte:head>
	<title>{TAB_TITLES[5]}</title>
</svelte:head>

<X86SimView />
