<script lang="ts">
	import { TAB_TITLES } from '$lib/routes-map';
	import ChatbotView from '$lib/components/chatbot/ChatbotView.svelte';
	import { t } from '$lib/i18n';
</script>

<svelte:head>
	<title>{TAB_TITLES[6]}</title>
	<meta name="description" content={$t('chatbot.meta.description')} />
</svelte:head>

<ChatbotView />
