<!--
  Title block — bottom-right, like the metadata box on a real engineering
  drawing (PROJECT / DRAWN BY / UNITS / FORMAT). Decorative only.
-->
<div class="titleblock" aria-hidden="true">
    <div class="lbl">PROJECT</div>
    <div class="val accent">KURASHIZU</div>
    <div class="lbl">DRAWN BY</div>
    <div class="val">SELF</div>
    <div class="lbl">UNITS</div>
    <div class="val">PX · RATIO</div>
    <div class="lbl">FORMAT</div>
    <div class="val">A4 LANDSCAPE</div>
</div>

<style>
    .titleblock {
        position: fixed;
        bottom: 32px;
        right: 56px;
        z-index: 15;
        display: grid;
        grid-template-columns: auto auto;
        font-family: "JetBrains Mono", monospace;
        font-size: 0.66rem;
        color: var(--ink-3);
        letter-spacing: 0.12em;
        text-transform: uppercase;
        border: 1px solid var(--ink-2);
        background: rgba(10, 31, 61, 0.6);
        animation: draw 800ms 700ms both;
    }
    .titleblock > div {
        padding: 6px 12px;
        border-right: 1px solid var(--line);
        border-bottom: 1px solid var(--line);
    }
    .titleblock > div:nth-child(2n) {
        border-right: 0;
    }
    .titleblock > div:nth-last-child(-n + 2) {
        border-bottom: 0;
    }
    .lbl {
        color: var(--ink-4);
    }
    .val {
        color: var(--ink-2);
    }
    .val.accent {
        color: var(--accent);
    }
    @keyframes draw {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    @media (max-width: 820px) {
        .titleblock {
            right: 16px;
            bottom: 16px;
            font-size: 0.55rem;
        }
        .titleblock > div {
            padding: 4px 8px;
        }
    }
</style>
