<script lang="ts">
    import { onMount } from "svelte";

    /**
     * Orange cursor follower dot. `over` class enlarges it when hovering
     * interactive elements. Smooth rAF follow.
     *
     * Bound: <div class="cursor-dot" bind:this={dot} />
     */
    let dot: HTMLDivElement;

    onMount(() => {
        let tx = window.innerWidth / 2;
        let ty = window.innerHeight / 2;
        let cx = tx;
        let cy = ty;

        const onMove = (e: MouseEvent) => {
            tx = e.clientX;
            ty = e.clientY;
        };
        const onEnter = () => (dot.style.opacity = "0.6");
        const onLeave = () => (dot.style.opacity = "0");

        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseleave", onLeave);
        document.addEventListener("mouseenter", onEnter);

        // Watch for any module enter/leave to toggle the larger ring.
        const onModuleEnter = () => dot.classList.add("over");
        const onModuleLeave = () => dot.classList.remove("over");
        const modules = document.querySelectorAll(".module");
        modules.forEach((m) => {
            m.addEventListener("mouseenter", onModuleEnter);
            m.addEventListener("mouseleave", onModuleLeave);
        });

        let raf = 0;
        const tick = () => {
            cx += (tx - cx) * 0.18;
            cy += (ty - cy) * 0.18;
            dot.style.left = cx + "px";
            dot.style.top = cy + "px";
            raf = requestAnimationFrame(tick);
        };
        tick();

        return () => {
            cancelAnimationFrame(raf);
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseleave", onLeave);
            document.removeEventListener("mouseenter", onEnter);
            modules.forEach((m) => {
                m.removeEventListener("mouseenter", onModuleEnter);
                m.removeEventListener("mouseleave", onModuleLeave);
            });
        };
    });
</script>

<div class="cursor-dot" bind:this={dot} aria-hidden="true"></div>

<style>
    .cursor-dot {
        position: fixed;
        width: 10px;
        height: 10px;
        border: 1px solid var(--accent);
        border-radius: 50%;
        pointer-events: none;
        z-index: 100;
        transform: translate(-50%, -50%);
        mix-blend-mode: screen;
        transition:
            width 250ms ease,
            height 250ms ease,
            opacity 250ms ease;
        opacity: 0;
    }
    /* `.over` is toggled via classList in the onMount handler, not
       via a Svelte class binding — use :global so the scoped-style
       pruner keeps the rule. */
    .cursor-dot:global(.over) {
        width: 22px;
        height: 22px;
        opacity: 1;
    }
    @media (hover: none), (pointer: coarse) {
        .cursor-dot {
            display: none;
        }
    }
</style>
