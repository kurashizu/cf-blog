<script lang="ts">
	import { TAB_TITLES } from '$lib/routes-map';
	import GuestbookForm from '$lib/components/guestbook/GuestbookForm.svelte';
</script>

<svelte:head>
	<title>{TAB_TITLES[1]}</title>
</svelte:head>

<GuestbookForm />
