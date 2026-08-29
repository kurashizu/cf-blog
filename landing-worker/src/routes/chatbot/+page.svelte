<script lang="ts">
	import { TAB_TITLES } from '$lib/routes-map';
	import ChatbotView from '$lib/components/chatbot/ChatbotView.svelte';
</script>

<svelte:head>
	<title>{TAB_TITLES[6]}</title>
	<meta
		name="description"
		content="A language model running entirely in your browser on WebGPU — no server, nothing leaves the tab."
	/>
</svelte:head>

<ChatbotView />
