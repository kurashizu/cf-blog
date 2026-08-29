<script lang="ts">
	import { TAB_TITLES } from '$lib/routes-map';
	import KrszVmView from '$lib/components/krsz-vm/KrszVmView.svelte';
</script>

<svelte:head>
	<title>{TAB_TITLES[5]}</title>
</svelte:head>

<KrszVmView />
