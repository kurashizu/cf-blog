<script lang="ts">
	import { TAB_TITLES } from '$lib/routes-map';
	import LmSpaceView from '$lib/components/lm-space/LmSpaceView.svelte';
</script>

<svelte:head>
	<title>{TAB_TITLES[4]}</title>
</svelte:head>

<LmSpaceView />
