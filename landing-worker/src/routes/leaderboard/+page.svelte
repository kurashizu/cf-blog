<script lang="ts">
	import { TAB_TITLES } from '$lib/routes-map';
	import LeaderboardView from '$lib/components/leaderboard/LeaderboardView.svelte';
</script>

<svelte:head>
	<title>{TAB_TITLES[4]}</title>
</svelte:head>

<LeaderboardView />
