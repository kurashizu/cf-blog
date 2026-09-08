# UI primitives — the one base every panel is drawn from

`src/lib/components/ui/` holds the shared building blocks. Every new control on the site is one of these, or is composed from them. Do not hand-write `class="press px-2 py-1 border …"` on a raw `<button>` again: that is how the eight slightly different button recipes came to exist.

```svelte
<script lang="ts">
  import { Button, Toggle, Card, SectionTitle, Kbd, TextInput, Dialog, Menu, MenuItem } from '$lib/components/ui';
</script>
```

| Need | Use | Notes |
|---|---|---|
| any clickable action | `<Button>` | `variant` outline / solid / neutral / ghost / link, `color`, `size` xs / sm / md / lg, `active` for toggle state (renders `aria-pressed`), `label` for icon-only buttons, `sound` (default click). Passes every native button attribute through. |
| ON / OFF switch | `<Toggle checked onchange label>` | `role="switch"`. `label` is mandatory — the visible text is only ON/OFF. |
| bordered panel | `<Card>` | `tone` default / sunken / flat, `pad` none…lg, optional `title` + `color` (renders a SectionTitle and becomes a `<section>`). |
| coloured heading with hairline | `<SectionTitle color level>` | A real `<h2>`/`<h3>`; `right` snippet for buttons on the heading row. |
| key cap | `<Kbd color>` | |
| text field | `<TextInput label bind:value>` | Label always present; `labelHidden` keeps it reader-only. |
| modal | `<Dialog title label onClose>` | Scrim, panel, `┌─[ TITLE ]─┐` header, `[ Esc ]`; `use:modal` supplies role, focus trap, Escape, backdrop click, inert page, focus return. `label` is the spoken name. |
| popup list | `<Menu onClose>` + `<MenuItem checked note>` | `role="menu"`, arrow keys, typeahead, backdrop; `portal` to body for menus inside clipped panels. MenuItem with `checked` is a `menuitemradio`. |

Knobs and faders live in `hardware/` and are already sliders (`role="slider"`, arrow keys, `aria-valuetext`). For a dialog that cannot use `<Dialog>` (a full-screen stage, an anchored tour bubble), attach `use:modal` from `$lib/actions/modal` to the scrim yourself.

## Rules

- **Names.** Every control has an accessible name: visible text, or `label=` / `aria-label`. `title=` is a tooltip, not a name; readers and touch devices do not show it. Keep `title` for the long hint, add `aria-label` (or visible text) for the short name.
- **Roles and state.** Toggle-ish buttons pass `active` (→ `aria-pressed`); switches use `<Toggle>`; pick-one lists use `MenuItem checked`; tabs inside a view use `role="tablist"` / `role="tab"` `aria-selected` + `role="tabpanel"`, with Left/Right moving between tabs.
- **Keyboard.** Anything that reacts to pointer must react to keyboard. Never put `onclick` on a `<div>`; use `<Button>` or, for a large drawing surface, a `<button>`/`role="application"` with an `onkeydown` and a description of the keys in its `aria-label`.
- **Never `svelte-ignore a11y_*`.** Fix the element instead. A backdrop that closes on click is a `use:modal` / `<Menu>` concern, not an `onclick` div.
- **Canvas.** `role="img"` + `aria-label` describing what is drawn; if it changes, put the current reading in a `sr-only` element or `announce()` it (throttled, ≤ 1 per second) from `$lib/stores/a11y`.
- **Live changes.** A result that appears without focus moving (a test finished, an error line, a status flipped) is announced with `announce(text)` from `$lib/stores/a11y`. Short sentences; never announce something that is about to receive focus.
- **Motion.** Use `fade`/`fly`/`scale` from `$lib/perf-transitions` (they collapse under reduced motion and performance mode), never from `svelte/transition` directly.
- **Colour.** Pass the view's accent as `color`; do not add `text-[#hex]`/`border-[#hex]` class soup around a primitive.
- **i18n.** Every visible or spoken string goes through `$t` (`src/lib/i18n/README.md`).
