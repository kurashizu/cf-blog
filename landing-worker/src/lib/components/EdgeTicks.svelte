<script lang="ts">
    /**
     * Edge tick marks — ruler ticks along one edge of the viewport.
     * 4 are placed (top/bottom/left/right) by the parent +page.
     * `viewBox` is fixed at 1000x8 (or 8x1000); `preserveAspectRatio="none"`
     * stretches them to the actual edge length.
     */
    export let edge: "top" | "bottom" | "left" | "right" = "top";

    const ticks = Array.from({ length: 10 }, (_, i) => i * 100 + 50);
    const major = new Set([0, 2, 4, 6, 8]);
</script>

{#if edge === "top" || edge === "bottom"}
    <svg
        class="ticks {edge}"
        viewBox="0 0 1000 8"
        preserveAspectRatio="none"
        fill="none"
        aria-hidden="true"
    >
        {#each ticks as x}
            <line
                x1={x}
                y1="0"
                x2={x}
                y2={major.has((x - 50) / 100) ? 8 : 4}
                stroke="currentColor"
                stroke-width="0.5"
            />
        {/each}
    </svg>
{:else}
    <svg
        class="ticks {edge}"
        viewBox="0 0 8 1000"
        preserveAspectRatio="none"
        fill="none"
        aria-hidden="true"
    >
        {#each ticks as y}
            <line
                x1="0"
                y1={y}
                x2={major.has((y - 50) / 100) ? 8 : 4}
                y2={y}
                stroke="currentColor"
                stroke-width="0.5"
            />
        {/each}
    </svg>
{/if}

<style>
    .ticks {
        position: fixed;
        z-index: 5;
        pointer-events: none;
        color: var(--ink-3);
        opacity: 0.5;
    }
    .ticks.top,
    .ticks.bottom {
        left: 0;
        right: 0;
        height: 8px;
    }
    .ticks.top { top: 0; }
    .ticks.bottom { bottom: 0; }
    .ticks.left,
    .ticks.right {
        top: 0;
        bottom: 0;
        width: 8px;
    }
    .ticks.left { left: 0; }
    .ticks.right { right: 0; }
</style>
