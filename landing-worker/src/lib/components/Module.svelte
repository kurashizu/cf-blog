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
        padding: 26px 28px 24px;
        background: transparent;
        border: 1px solid var(--ink-2);
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
        background: rgba(255, 139, 61, 0.04);
        transform: translate(-2px, -2px);
        box-shadow: 6px 6px 0 rgba(255, 139, 61, 0.15);
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

    .top-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        font-family: "JetBrains Mono", monospace;
        font-size: 0.7rem;
        color: var(--ink-3);
        letter-spacing: 0.14em;
        text-transform: uppercase;
        margin-bottom: 18px;
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
        font-size: clamp(1.4rem, 2.4vw, 2rem);
        letter-spacing: -0.025em;
        color: var(--ink);
        line-height: 1;
        text-transform: lowercase;
    }
    .desc {
        margin-top: 8px;
        font-family: "JetBrains Mono", monospace;
        font-size: 0.7rem;
        color: var(--ink-3);
        letter-spacing: 0.06em;
        line-height: 1.5;
        min-height: 2.5em;
    }
    .url {
        margin-top: 14px;
        padding-top: 12px;
        border-top: 1px dashed var(--line);
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-family: "JetBrains Mono", monospace;
        font-size: 0.68rem;
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
        top: -22px;
        left: 0;
    }
    .module:hover .dim {
        color: var(--accent);
    }

    @media (max-width: 820px) {
        .module {
            padding: 18px 18px 16px;
        }
        .name {
            font-size: 1.3rem;
        }
        .desc {
            font-size: 0.62rem;
        }
    }
</style>
