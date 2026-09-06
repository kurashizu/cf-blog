# i18n — how text is translated on this site

Locales: `en` (source) · `zh-CN` 简体中文 · `zh-TW` 繁體中文 · `ja` 日本語 · `ko` 한국어.
The user picks one in the footer (`[EN▲]`) or the site follows the browser. Everything user-visible is translated **except** the professional terms listed under "Do not translate".

## The three doors

```svelte
<script lang="ts">
  import { t } from '$lib/i18n';
</script>
<button title={$t('synth.transport.playHint')}>{$t('synth.transport.play')}</button>
<span>{$t('vm.status.booted', { seconds: 3.2 })}</span>   <!-- {seconds} in the message -->
```

- **`$t('key', vars?)`** — templates, `$derived`, `$effect`. Reactive: switching language re-renders. This is the default door; use it in every `.svelte` file. In `<script>` code that computes a string *once* (an `onMount`, a click handler) it is fine to use `$t(...)` too — Svelte allows `$t` in script code of a component.
- **`tr('key', vars?)`** — plain `.ts`/`.js` modules (stores, console commands, tour step definitions, data tables). Non-reactive, resolved at call time. If the module builds an array of strings once at import time, wrap it in a function (`export function bootLines() { return [tr('…'), …] }`) or use `localized`, so it is evaluated when needed, not at import.
- **`localized({ en: X, 'zh-CN': X, … })`** / **`$pick({…})`** — non-string values (an array of lines, an object). English required; the rest fall back to English.

A key missing in a locale falls back to English, then to the key; dev mode logs `[i18n] missing key`.

## Message files

`src/lib/i18n/messages/<area>.ts`, one per area (`chrome`, `home`, `synth`, `synth-panels`, `utilities`, `chatbot`, `vm`, `lmspace`, `community`, `common`). Only edit the file for your area. Never edit `messages/index.ts`.

Rules for the file (the check script depends on them):

- Exactly this shape: `import type { Messages } from '../types';` then `export default { en: {…}, 'zh-CN': {…}, 'zh-TW': {…}, ja: {…}, ko: {…} } satisfies Messages;`. **Plain object literal only** — no variables, no functions, no template literals, no spreads, no comments containing `satisfies`.
- Keys: `area.section.name` in camelCase, e.g. `synth.transport.playHint`, `vm.dialog.diskFull`. Every key of your area starts with your area's prefix. One key per line, in the **same order in every locale**.
- Placeholders: `{name}` — same placeholder names in every locale. Never build sentences by concatenating pieces; move the whole sentence into one message with placeholders.
- Keep newlines as `\n` where the UI shows a multi-line string.
- Check: `node scripts/i18n-check.mjs <area>` → lists missing / extra keys, placeholder mismatches, untranslated strings. Must print only `<area>.ts: N keys`.

## What to translate

Every string a user can read: visible text, `title=` tooltips, `aria-label`, `placeholder`, `alt`, status messages, toasts, confirm() / alert() text, error messages built in code, `<title>` and meta description, tour steps, console-command output that is prose, dialog headings, button captions, empty-state hints.

Translation quality: natural, concise, the register of a technical hobby site (terse, friendly, no marketing tone). zh-TW is real Traditional Chinese with Taiwan wording (「設定」not「设置」, 「檔案」not「文件」, 「滑鼠」not「鼠标」), not a character conversion. Japanese uses です/ます for sentences, katakana for common loanwords (ブラウザ, キーボード). Korean uses 해요체/합니다체 consistently (합니다체 for UI). Keep product names, hostnames, hotkeys (`Ctrl+0`, `` ` ``, `Esc`), file names, code, numbers and units as they are.

## Do not translate

- **Synth rack labels**: every button / knob / fader label on the racks and in the settings tabs that is a ≤4-character abbreviation (`DET`, `SEMI`, `PW`, `PHS`, `SUB`, `RPT`, `GAP`, `LAYR`, `NTCH`, `ATK`, `DCY`, `REL`, `LFO`, `CUT`, `RES`, `EQ`, `FX`, `DUCK`, `KEY`, `BPM`, `H1`…). They are engraved hardware-style labels and stay English in every locale. Module titles like `DUAL OSC`, `FILTER`, `ENVELOPE`, `LFO`, `FX / EQ`, `OUT` also stay.
- Waveform names (`SAW`, `PWM`, `SUPERSAW`), preset names (`ACID BASS`), song titles, track names (`TRK 1`), note names (`C4`), MIDI/CC numbers, units (`Hz`, `ms`, `dB`, `st`, `ct`, `%`).
- Brand and proper nouns: `KRSZ`, `krsz.in`, `kurashizu`, `Cloudflare`, `GitHub`, `Hugging Face`, `LIFE.LAB`, `LM-SPACE`, project names, model names, `Jelly Pixel`.
- Hotkey glyphs and key names, the prompt `>`/`~`, ASCII art, log lines that mimic real system output (kernel / BIOS / POST style lines like `CPU0: …` may stay in English — that is the joke; but any *prose* sentence in them is translated).
- Command names in the console (`help`, `trace`, `theme`) — only their descriptions are translated.

**Tooltips of rack knobs ARE translated** (the explanation sentence), keeping the parameter name itself in English inside it, e.g. zh-CN: `DET：两个振荡器之间的失谐量（音分）`.

## Mechanics

- Add `import { t } from '$lib/i18n';` (and `tr` where needed) to each file you touch. Replace the literal with `$t('key')`. For a `title="…"` attribute write `title={$t('…')}`. For class strings and `data-*` attributes, do nothing.
- A string chosen by a ternary (`ok ? 'Saved' : 'Failed'`) becomes two keys.
- Arrays of options with `label` fields defined in `<script>` at module level: make labels keys and translate at render (`{$t(opt.label)}`), or turn the array into a `$derived` that calls `$t`.
- Dates: `toLocaleDateString('en-AU', …)` → `toLocaleDateString($locale, …)` (import `locale` from `$lib/i18n`; use `get(locale)` in .ts).
- Do **not** change layout, classes, behaviour, or the English wording (the English message must equal the current text exactly, so the site looks identical in `en`). If an English string is a fragment you have to merge to translate properly, merging is fine.
- Long texts (paragraphs) keep their line breaks as `\n` if the markup relied on them; otherwise a normal single string.
- After editing: `npx svelte-check --tsconfig ./tsconfig.json --threshold error` must report 0 errors for the files you touched, and `node scripts/i18n-check.mjs <area>` must be clean.
