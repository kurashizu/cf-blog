<script lang="ts">
    import { getCurrentYear, getLocalTimezone } from "$lib/time";

    const year = getCurrentYear();
    const { city, offset } = getLocalTimezone();
</script>

<div class="meta-bl">
    <div>EST. <span class="accent">{year}</span></div>
    <div>{city} · {offset}</div>
</div>

<style>
    .meta-bl {
        position: fixed;
        bottom: 32px;
        left: 56px;
        z-index: 15;
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-family: "JetBrains Mono", monospace;
        font-size: 0.66rem;
        color: var(--ink-3);
        letter-spacing: 0.18em;
        text-transform: uppercase;
        pointer-events: none;
        animation: draw 800ms 600ms both;
    }
    .accent {
        color: var(--accent);
    }
    @keyframes draw {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    @media (max-width: 820px) {
        .meta-bl {
            left: 16px;
            bottom: 16px;
            font-size: 0.55rem;
        }
    }
    @media (max-width: 540px) {
        .meta-bl {
            position: relative;
            left: auto;
            bottom: auto;
            flex-direction: row;
            justify-content: space-between;
            gap: 12px;
            margin: 0 max(16px, env(safe-area-inset-right))
                max(24px, env(safe-area-inset-bottom))
                max(16px, env(safe-area-inset-left));
            letter-spacing: 0.1em;
        }
    }
</style>
