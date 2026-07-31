<script lang="ts">
    /**
     * Corner crosshair — registration mark at a viewport corner.
     * 4 are placed (TL / TR / BL / BR) by the parent +page.
     */
    export let corner: "tl" | "tr" | "bl" | "br" = "tl";
</script>

<svg
    class="crosshair {corner}"
    viewBox="0 0 18 18"
    fill="none"
    aria-hidden="true"
>
    <line
        x1="0"
        y1="9"
        x2="18"
        y2="9"
        stroke="currentColor"
        stroke-width="1"
    />
    <line
        x1="9"
        y1="0"
        x2="9"
        y2="18"
        stroke="currentColor"
        stroke-width="1"
    />
    <circle cx="9" cy="9" r="3" stroke="currentColor" stroke-width="1" />
</svg>

<style>
    .crosshair {
        position: fixed;
        width: 18px;
        height: 18px;
        z-index: 20;
        pointer-events: none;
        color: var(--ink-2);
        opacity: 0.6;
    }
    .tl { top: 16px; left: 16px; }
    .tr { top: 16px; right: 16px; transform: scaleX(-1); }
    .bl { bottom: 16px; left: 16px; transform: scaleY(-1); }
    .br { bottom: 16px; right: 16px; transform: scale(-1, -1); }
    @media (max-width: 540px) {
        .crosshair {
            display: none;
        }
    }
</style>
