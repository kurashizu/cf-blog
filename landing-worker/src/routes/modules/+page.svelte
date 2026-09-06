<script lang="ts">
	import { t } from '$lib/i18n';
	import ProjectsView from '$lib/components/projects/ProjectsView.svelte';
</script>

<svelte:head>
	<title>{$t('common.tabTitle.0')}</title>
</svelte:head>

<ProjectsView />
