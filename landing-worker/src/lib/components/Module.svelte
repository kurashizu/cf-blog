<script lang="ts">
    import type { Portal } from "$lib/portals";
    import PortalIcon from "./PortalIcon.svelte";

    export let portal: Portal;
    export let index: number = 0;

    // Hostname (strip protocol) for the URL row.
    $: host = portal.url.replace(/^https?:\/\//, "");

    // Animation delay based on grid index (250/350/450/550 ms).
    $: delay = `${250 + index * 100}ms`;
</script>

<a
    class="module"
    class:featured={portal.id === "01"}
    href={portal.url}
    style="--delay: {delay};"
>
    <span class="dim t">W · 240</span>
    <div class="top-row">
        <span class="num">{portal.id} / 04</span>
        <span class="status">
            <span class="pulse" aria-hidden="true"></span>
            <span>ONLINE</span>
        </span>
    </div>
    {#if portal.id === "01"}
        <span class="role">PRIMARY NODE / ARTICLE SYSTEM</span>
    {/if}
    <PortalIcon icon={portal.icon} />
    <div class="name">{portal.name}</div>
    <div class="desc">{portal.desc}</div>
    <div class="url">
        <span>{host}</span>
        <span class="arrow">→</span>
    </div>
</a>

<style>
    .module {
        position: relative;
        display: block;
        text-decoration: none;
        color: inherit;
        cursor: pointer;
        min-height: 0;
        padding: 16px 20px 14px;
        background: rgba(20, 9, 11, 0.3);
        border: 1px solid var(--ink-2);
        box-shadow: 0 8px 22px rgba(10, 3, 5, 0.24);
        transition:
            border-color 250ms ease,
            background 250ms ease,
            transform 250ms ease;
        opacity: 0;
        animation: module-in 700ms cubic-bezier(0.2, 0.7, 0.2, 1) var(--delay) both;
    }
    @keyframes module-in {
        from {
            opacity: 0;
            transform: translateY(8px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .module::before {
        content: "";
        position: absolute;
        inset: 6px;
        border: 1px solid var(--line);
        pointer-events: none;
    }

    /* Corner ticks on all 4 corners. */
    .module::after {
        content: "";
        position: absolute;
        top: -1px;
        left: -1px;
        right: -1px;
        bottom: -1px;
        pointer-events: none;
        background:
            linear-gradient(
                    to right,
                    var(--ink-2) 0,
                    var(--ink-2) 8px,
                    transparent 8px,
                    transparent calc(100% - 8px),
                    var(--ink-2) calc(100% - 8px)
                )
                top left / 100% 1px no-repeat,
            linear-gradient(
                    to right,
                    var(--ink-2) 0,
                    var(--ink-2) 8px,
                    transparent 8px,
                    transparent calc(100% - 8px),
                    var(--ink-2) calc(100% - 8px)
                )
                bottom left / 100% 1px no-repeat,
            linear-gradient(
                    to bottom,
                    var(--ink-2) 0,
                    var(--ink-2) 8px,
                    transparent 8px,
                    transparent calc(100% - 8px),
                    var(--ink-2) calc(100% - 8px)
                )
                top left / 1px 100% no-repeat,
            linear-gradient(
                    to bottom,
                    var(--ink-2) 0,
                    var(--ink-2) 8px,
                    transparent 8px,
                    transparent calc(100% - 8px),
                    var(--ink-2) calc(100% - 8px)
                )
                top right / 1px 100% no-repeat;
    }

    .module:hover {
        border-color: var(--accent);
        background: rgba(160, 72, 86, 0.07);
        transform: translate(-2px, -2px);
        box-shadow: 6px 6px 0 rgba(160, 72, 86, 0.22),
            0 12px 28px rgba(10, 3, 5, 0.28);
    }
    .module.featured {
        grid-row: 1 / -1;
        padding: 30px 36px 28px;
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        background: rgba(160, 72, 86, 0.06);
        box-shadow: 0 12px 32px rgba(10, 3, 5, 0.34);
    }
    .module.featured:hover {
        background: rgba(160, 72, 86, 0.11);
        box-shadow: 8px 8px 0 rgba(160, 72, 86, 0.25),
            0 18px 38px rgba(10, 3, 5, 0.38);
    }
    .module:hover::before {
        border-color: var(--accent);
        opacity: 0.6;
    }
    .module:hover :global(.icon) {
        color: var(--accent);
        transform: translate(2px, -2px);
    }
    .module:hover::after {
        background:
            linear-gradient(
                    to right,
                    var(--accent) 0,
                    var(--accent) 8px,
                    transparent 8px,
                    transparent calc(100% - 8px),
                    var(--accent) calc(100% - 8px)
                )
                top left / 100% 1px no-repeat,
            linear-gradient(
                    to right,
                    var(--accent) 0,
                    var(--accent) 8px,
                    transparent 8px,
                    transparent calc(100% - 8px),
                    var(--accent) calc(100% - 8px)
                )
                bottom left / 100% 1px no-repeat,
            linear-gradient(
                    to bottom,
                    var(--accent) 0,
                    var(--accent) 8px,
                    transparent 8px,
                    transparent calc(100% - 8px),
                    var(--accent) calc(100% - 8px)
                )
                top left / 1px 100% no-repeat,
            linear-gradient(
                    to bottom,
                    var(--accent) 0,
                    var(--accent) 8px,
                    transparent 8px,
                    transparent calc(100% - 8px),
                    var(--accent) calc(100% - 8px)
                )
                top right / 1px 100% no-repeat;
    }

    .role {
        margin-bottom: 18px;
        font-family: "JetBrains Mono", monospace;
        font-size: 0.62rem;
        color: var(--accent);
        letter-spacing: 0.14em;
        text-transform: uppercase;
    }
    .top-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        font-family: "JetBrains Mono", monospace;
        font-size: 0.7rem;
        color: var(--ink-3);
        letter-spacing: 0.14em;
        text-transform: uppercase;
        margin-bottom: 10px;
    }
    .module.featured .top-row {
        margin-bottom: 0;
    }
    .num {
        color: var(--ink);
        font-weight: 600;
        transition: color 250ms ease;
    }
    .module:hover .num {
        color: var(--accent);
    }
    .status {
        display: flex;
        align-items: center;
        gap: 5px;
    }
    .pulse {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--ink-3);
        transition:
            background 250ms ease,
            box-shadow 250ms ease;
    }
    .module:hover .pulse {
        background: var(--accent);
        box-shadow: 0 0 8px var(--accent-glow);
    }
    .name {
        font-family: "Inter Tight", sans-serif;
        font-weight: 700;
        font-size: clamp(1.3rem, 2.1vw, 1.7rem);
        letter-spacing: -0.025em;
        color: var(--ink);
        line-height: 1;
        text-transform: lowercase;
    }
    .desc {
        margin-top: 5px;
        font-family: "JetBrains Mono", monospace;
        font-size: 0.64rem;
        color: var(--ink-3);
        letter-spacing: 0.05em;
        line-height: 1.45;
        min-height: 0;
    }
    .module.featured .desc {
        max-width: 34rem;
        margin-top: 10px;
        font-size: 0.78rem;
        line-height: 1.6;
    }
    .url {
        margin-top: auto;
        padding-top: 10px;
        border-top: 1px dashed var(--line);
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-family: "JetBrains Mono", monospace;
        font-size: 0.62rem;
        color: var(--ink-3);
        letter-spacing: 0.04em;
    }
    .module:hover .url {
        border-top-color: var(--accent);
        color: var(--ink-2);
    }
    .arrow {
        color: var(--ink-3);
        transition:
            transform 250ms ease,
            color 250ms ease;
    }
    .module:hover .arrow {
        color: var(--accent);
        transform: translateX(4px);
    }

    .dim {
        position: absolute;
        font-family: "JetBrains Mono", monospace;
        font-size: 0.62rem;
        color: var(--ink-4);
        letter-spacing: 0.16em;
        text-transform: uppercase;
        pointer-events: none;
    }
    .dim.t {
        top: -20px;
        left: 0;
    }
    .module.featured .dim.t {
        top: -22px;
    }
    .module:not(.featured) :global(.icon) {
        width: 30px;
        height: 30px;
        margin: 0 0 10px;
    }
    .module.featured :global(.icon) {
        width: 56px;
        height: 56px;
        margin: 26px 0 24px;
    }
    .module.featured .name {
        font-size: clamp(2.5rem, 5vw, 4.5rem);
        line-height: 0.92;
    }
    .module:hover .dim {
        color: var(--accent);
    }

    @media (max-width: 820px) {
        .module {
            min-width: 0;
            padding: 18px 18px 16px;
        }
        .module.featured {
            padding: 24px 26px 22px;
        }
        .name {
            font-size: 1.3rem;
        }
        .desc {
            font-size: 0.62rem;
        }
    }
    @media (max-width: 540px) {
        .module {
            min-height: 168px;
            padding: 18px 20px 16px;
            -webkit-tap-highlight-color: transparent;
            touch-action: manipulation;
        }
        .module.featured {
            min-height: 300px;
            padding: 22px 20px 20px;
        }
        .module.featured .name {
            font-size: 3rem;
        }
        .module:active {
            border-color: var(--accent);
            background: rgba(160, 72, 86, 0.1);
            transform: translateY(1px);
        }
        .top-row {
            margin-bottom: 12px;
        }
        .name {
            font-size: 1.45rem;
        }
        .desc {
            min-height: 0;
            font-size: 0.66rem;
        }
        .url {
            margin-top: 12px;
            overflow: hidden;
        }
        .url > span:first-child {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .arrow {
            flex: 0 0 auto;
            margin-left: 12px;
        }
        .dim {
            display: none;
        }
    }

    @media (hover: none) {
        .module:hover {
            border-color: var(--ink-2);
            background: rgba(20, 9, 11, 0.3);
            transform: none;
            box-shadow: 0 8px 22px rgba(10, 3, 5, 0.24);
        }
        .module.featured:hover {
            background: rgba(160, 72, 86, 0.06);
            box-shadow: 0 12px 32px rgba(10, 3, 5, 0.34);
        }
    }
</style>
