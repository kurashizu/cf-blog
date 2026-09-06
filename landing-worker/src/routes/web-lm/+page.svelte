<script lang="ts">
	import { t } from '$lib/i18n';
	import ChatbotView from '$lib/components/chatbot/ChatbotView.svelte';
</script>

<svelte:head>
	<title>{$t('common.tabTitle.6')}</title>
	<meta name="description" content={$t('chatbot.meta.description')} />
</svelte:head>

<ChatbotView />
