<script lang="ts">
	import { t } from '$lib/i18n';
	import GuestbookForm from '$lib/components/guestbook/GuestbookForm.svelte';
</script>

<svelte:head>
	<title>{$t('common.tabTitle.1')}</title>
</svelte:head>

<GuestbookForm />
