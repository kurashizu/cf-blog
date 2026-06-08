# ROMs

This folder holds **built-in (local)** NES ROMs that ship with the static
site. The `local-roms` manifest is **auto-generated** — don't edit
`components/nes/roms.generated.ts` by hand.

## Adding a Local ROM

1. Create a subdirectory under `public/roms/<id>/` — the directory name becomes the ROM's `id`.
2. Place the `.nes` file inside (the first `.nes` found is used).
3. (Optional) Add `metadata.json` in the same directory for a human-readable title and description:

```json
{
    "title": "Super Mario Bros.",
    "description": "Classic platformer."
}
```

4. Regenerate the manifest:

```bash
npm run generate-roms
```

Or just run `npm run dev` / `npm run build` — the generation runs automatically via `predev` / `prebuild`.

## Directory Layout

```
public/roms/
  my-game/
    my-game.nes
    metadata.json        ← optional
```

---

## Remote ROMs (URLs)

ROMs hosted elsewhere (CDN, R2, GitHub raw, etc.) are configured manually
in [`components/nes/roms.ts`](../components/nes/roms.ts) under
`REMOTE_ROMS`. They are fetched at runtime by the browser.

**CORS requirement:** the remote server must respond with
`Access-Control-Allow-Origin: *` (or your page's origin). CORS-friendly
hosts include `raw.githubusercontent.com` and your own Cloudflare R2
bucket (configure CORS in the R2 dashboard).

**Only add ROMs you own or that are freely licensed** (public domain,
homebrew, etc.). Don't ship commercial ROMs.
