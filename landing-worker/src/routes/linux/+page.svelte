<script lang="ts">
	import { TAB_TITLES } from '$lib/routes-map';
	import LinuxView from '$lib/components/linux/LinuxView.svelte';
</script>

<svelte:head>
	<title>{TAB_TITLES[5]}</title>
</svelte:head>

<LinuxView />
