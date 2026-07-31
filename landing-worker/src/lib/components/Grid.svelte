<script lang="ts">
    import { PORTALS } from "$lib/portals";
    import Module from "./Module.svelte";
</script>

<div class="grid">
    <span class="center-mark" aria-hidden="true"></span>
    {#each PORTALS as portal, i}
        <Module {portal} index={i} />
    {/each}
</div>

<style>
    .grid {
        position: relative;
        width: 100%;
        max-width: 1100px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        grid-template-rows: 1fr 1fr;
        gap: 36px 60px;
    }
    .grid::before,
    .grid::after {
        content: "";
        position: absolute;
        background: var(--line);
        pointer-events: none;
    }
    .grid::before {
        top: 50%;
        left: -32px;
        right: -32px;
        height: 1px;
    }
    .grid::after {
        left: 50%;
        top: -32px;
        bottom: -32px;
        width: 1px;
    }
    .center-mark {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 14px;
        height: 14px;
        pointer-events: none;
        z-index: 2;
    }
    .center-mark::before,
    .center-mark::after {
        content: "";
        position: absolute;
        background: var(--ink-2);
    }
    .center-mark::before {
        top: 50%;
        left: 0;
        right: 0;
        height: 1px;
        transform: translateY(-50%);
    }
    .center-mark::after {
        left: 50%;
        top: 0;
        bottom: 0;
        width: 1px;
        transform: translateX(-50%);
    }
    @media (max-width: 820px) {
        .grid {
            gap: 24px 20px;
        }
        .grid::before,
        .grid::after,
        .grid .center-mark {
            display: none;
        }
    }
    @media (max-width: 540px) {
        .grid {
            grid-template-columns: 1fr;
        }
    }
</style>
