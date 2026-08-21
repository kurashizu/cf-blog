<script lang="ts">
    import type { IconName } from "$lib/portals";
    export let icon: IconName;
</script>

{#if icon === "notebook"}
    <svg
        class="icon"
        width="36"
        height="36"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linecap="square"
        stroke-linejoin="miter"
    >
        <rect x="3" y="4" width="18" height="16" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="9" y1="4" x2="9" y2="20" />
        <circle cx="15" cy="14.5" r="0.8" fill="currentColor" />
        <circle cx="18" cy="14.5" r="0.8" fill="currentColor" />
    </svg>
{:else if icon === "mail"}
    <svg
        class="icon"
        width="36"
        height="36"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linecap="square"
        stroke-linejoin="miter"
    >
        <rect x="3" y="5" width="18" height="14" />
        <polyline points="3,5 12,13 21,5" />
    </svg>
{:else if icon === "share"}
    <svg
        class="icon"
        width="36"
        height="36"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linecap="square"
        stroke-linejoin="miter"
    >
        <circle cx="6" cy="12" r="2.5" />
        <circle cx="18" cy="6" r="2.5" />
        <circle cx="18" cy="18" r="2.5" />
        <line x1="8.2" y1="11" x2="15.8" y2="7" />
        <line x1="8.2" y1="13" x2="15.8" y2="17" />
    </svg>
{:else if icon === "github"}
    <svg
        class="icon"
        width="36"
        height="36"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linecap="square"
        stroke-linejoin="miter"
    >
        <path
            d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6.2a4.7 4.7 0 0 0-1.3-3.3 4.3 4.3 0 0 0-.1-3.3s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0C6.5 2.4 5.4 2.7 5.4 2.7a4.3 4.3 0 0 0-.1 3.3A4.7 4.7 0 0 0 4 9.3c0 4.7 2.7 5.8 5.5 6.2-.6.6-.6 1.2-.5 2V21"
        />
    </svg>
{/if}

<style>
    .icon {
        display: block;
        margin: 8px 0 18px;
        color: var(--ink-2);
        transition:
            color 250ms ease,
            transform 350ms ease;
    }
</style>
