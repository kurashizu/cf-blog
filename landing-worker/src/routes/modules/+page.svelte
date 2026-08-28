<script lang="ts">
	import { TAB_TITLES } from '$lib/routes-map';
	import ProjectsView from '$lib/components/projects/ProjectsView.svelte';
</script>

<svelte:head>
	<title>{TAB_TITLES[0]}</title>
</svelte:head>

<ProjectsView />
