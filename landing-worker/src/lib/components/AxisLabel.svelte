<script lang="ts">
    /**
     * Vertical rotated label along the left/right edge of the viewport,
     * like a section callout on a technical drawing.
     */
    export let side: "left" | "right" = "left";
    export let text: string = "SECTION A — A";
</script>

<div class="axis-label {side}">{text}</div>

<style>
    .axis-label {
        position: fixed;
        top: 50%;
        z-index: 5;
        font-family: "JetBrains Mono", monospace;
        font-size: 0.62rem;
        color: var(--ink-4);
        letter-spacing: 0.4em;
        text-transform: uppercase;
        pointer-events: none;
        white-space: nowrap;
    }
    .axis-label.left {
        left: 20px;
        transform: translateY(-50%) rotate(-90deg);
        transform-origin: center;
    }
    .axis-label.right {
        right: 20px;
        transform: translateY(-50%) rotate(90deg);
        transform-origin: center;
    }
    @media (max-width: 820px) {
        .axis-label { display: none; }
    }
</style>
