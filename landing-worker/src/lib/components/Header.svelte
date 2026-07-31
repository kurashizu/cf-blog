<script lang="ts">
    import { getCurrentYear } from "$lib/time";

    const year = getCurrentYear();
    // 07 is the schematic "revision" month — kept static, only the year
    // tracks the browser.
    const rev = `${year}.07`;
</script>

<header class="header">
    <div class="header-left">
        <div class="project">
            KURASHIZU<span class="slash">/</span>PORTAL
        </div>
        <div class="sub">PERSONAL SCHEMATIC · 4 DESTINATIONS</div>
    </div>
    <div class="header-right">
        <div class="row">
            <span class="label">REV</span>
            <span class="val accent">{rev}</span>
        </div>
        <div class="row">
            <span class="label">SHEET</span>
            <span class="val">01 / 01</span>
        </div>
        <div class="row">
            <span class="label">SCALE</span>
            <span class="val">1 : 1</span>
        </div>
    </div>
</header>

<style>
    .header {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        padding: 32px 56px;
        z-index: 15;
        pointer-events: none;
        animation: draw 800ms 100ms both;
    }
    .header-left {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .project {
        font-family: "Inter Tight", sans-serif;
        font-weight: 800;
        font-size: clamp(1.1rem, 1.8vw, 1.5rem);
        letter-spacing: -0.02em;
        color: var(--ink);
        text-transform: uppercase;
    }
    .slash {
        color: var(--accent);
        margin: 0 6px;
        font-weight: 400;
    }
    .sub {
        font-family: "JetBrains Mono", monospace;
        font-size: 0.7rem;
        color: var(--ink-3);
        letter-spacing: 0.18em;
        text-transform: uppercase;
    }
    .header-right {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 4px;
        font-family: "JetBrains Mono", monospace;
        font-size: 0.7rem;
        color: var(--ink-3);
        letter-spacing: 0.12em;
        text-transform: uppercase;
    }
    .row {
        display: flex;
        gap: 10px;
    }
    .label {
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
        .header { padding: 24px; }
        .sub { display: none; }
    }
    @media (max-width: 540px) {
        .header {
            position: absolute;
            padding: max(20px, env(safe-area-inset-top))
                max(20px, env(safe-area-inset-right)) 16px
                max(20px, env(safe-area-inset-left));
        }
        .project { font-size: 1.05rem; }
        .header-right { display: none; }
    }
</style>
