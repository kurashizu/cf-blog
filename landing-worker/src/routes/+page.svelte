<script lang="ts">
    import AxisLabel from "$lib/components/AxisLabel.svelte";
    import CornerCrosshair from "$lib/components/CornerCrosshair.svelte";
    import CursorDot from "$lib/components/CursorDot.svelte";
    import EdgeTicks from "$lib/components/EdgeTicks.svelte";
    import Grid from "$lib/components/Grid.svelte";
    import Header from "$lib/components/Header.svelte";
    import MetaBL from "$lib/components/MetaBL.svelte";
    import TitleBlock from "$lib/components/TitleBlock.svelte";
</script>

<svelte:head>
    <title>Kurashizu — Portal Schematic</title>
    <meta
        name="description"
        content="Personal portal of Kurashizu. Technical schematic of 4 destinations."
    />
</svelte:head>

<!-- Corner registration marks -->
<CornerCrosshair corner="tl" />
<CornerCrosshair corner="tr" />
<CornerCrosshair corner="bl" />
<CornerCrosshair corner="br" />

<!-- Edge ruler ticks -->
<EdgeTicks edge="top" />
<EdgeTicks edge="bottom" />
<EdgeTicks edge="left" />
<EdgeTicks edge="right" />

<Header />

<main>
    <Grid />
</main>

<TitleBlock />
<MetaBL />

<AxisLabel side="left" text="SECTION A — A" />
<AxisLabel side="right" text="DETAIL 1 / 4" />

<CursorDot />

<style>
    main {
        position: relative;
        z-index: 10;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 100px 56px 80px;
    }
    @media (max-width: 820px) {
        main {
            height: auto;
            min-height: 100svh;
            align-items: flex-start;
            padding: 96px 20px 180px;
        }
    }
    @media (max-width: 540px) {
        main {
            min-height: 0;
            padding: 84px max(16px, env(safe-area-inset-right)) 28px
                max(16px, env(safe-area-inset-left));
        }
    }
</style>
