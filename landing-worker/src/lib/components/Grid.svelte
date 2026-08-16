<script lang="ts">
    import { PORTALS } from "$lib/portals";
    import Module from "./Module.svelte";
</script>

<div class="grid">
    {#each PORTALS as portal, i}
        <Module {portal} index={i} />
    {/each}
</div>

<style>
    .grid {
        position: relative;
        width: 100%;
        max-width: 1160px;
        height: clamp(390px, calc(100vh - 300px), 500px);
        display: grid;
        grid-template-columns: minmax(0, 1.65fr) minmax(260px, 0.9fr);
        grid-template-rows: repeat(3, minmax(0, 1fr));
        gap: 20px 28px;
    }

    @media (max-width: 820px) {
        .grid {
            height: auto;
            max-width: 680px;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            grid-template-rows: auto;
            gap: 18px 16px;
        }
        .grid :global(.module.featured) {
            grid-column: 1 / -1;
            min-height: 330px;
        }
        .grid :global(.module:last-child) {
            grid-column: 1 / -1;
        }
    }

    @media (max-width: 540px) {
        .grid {
            grid-template-columns: minmax(0, 1fr);
            gap: 14px;
        }
        .grid :global(.module.featured),
        .grid :global(.module:last-child) {
            grid-column: auto;
        }
    }
</style>
