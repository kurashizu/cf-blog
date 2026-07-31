<script lang="ts">
    import { page } from "$app/stores";
</script>

<svelte:head>
    <title>Not Found — Kurashizu</title>
</svelte:head>

<div class="error">
    <div class="frame">
        <div class="corner tl"></div>
        <div class="corner tr"></div>
        <div class="corner bl"></div>
        <div class="corner br"></div>
        <div class="code">{$page.status}</div>
        <div class="label">PAGE NOT FOUND</div>
        <div class="path">{$page.url?.pathname}</div>
        <a class="cta" href="/">← RETURN TO PORTAL</a>
    </div>
</div>

<style>
    :global(body) {
        background-image: none !important;
    }
    .error {
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2rem;
    }
    .frame {
        position: relative;
        padding: 3rem 4rem;
        border: 1px solid var(--ink-2);
        text-align: center;
        min-width: 320px;
    }
    .corner {
        position: absolute;
        width: 12px;
        height: 12px;
        border-color: var(--accent);
        border-style: solid;
    }
    .corner.tl { top: -1px; left: -1px; border-width: 1px 0 0 1px; }
    .corner.tr { top: -1px; right: -1px; border-width: 1px 1px 0 0; }
    .corner.bl { bottom: -1px; left: -1px; border-width: 0 0 1px 1px; }
    .corner.br { bottom: -1px; right: -1px; border-width: 0 1px 1px 0; }
    .code {
        font-family: "Inter Tight", sans-serif;
        font-weight: 800;
        font-size: 5rem;
        line-height: 1;
        color: var(--accent);
        letter-spacing: -0.04em;
    }
    .label {
        margin-top: 0.5rem;
        font-family: "JetBrains Mono", monospace;
        font-size: 0.8rem;
        color: var(--ink-2);
        letter-spacing: 0.2em;
        text-transform: uppercase;
    }
    .path {
        margin-top: 1.5rem;
        font-family: "JetBrains Mono", monospace;
        font-size: 0.7rem;
        color: var(--ink-4);
        word-break: break-all;
    }
    .cta {
        display: inline-block;
        margin-top: 2rem;
        font-family: "JetBrains Mono", monospace;
        font-size: 0.72rem;
        color: var(--ink);
        text-decoration: none;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        padding: 0.6rem 1.2rem;
        border: 1px solid var(--ink-2);
        transition:
            border-color 200ms ease,
            color 200ms ease;
    }
    .cta:hover {
        border-color: var(--accent);
        color: var(--accent);
    }
</style>
