// ═════════════════════════════════════════════════════════════
// This file is auto-generated — do not edit by hand.
// Regenerate with:  node scripts/generate-rom-manifest.mjs
//                    npm run generate-roms
//
// Exposes LOCAL_ROMS (files in public/roms/). Remote ROMs are
// configured manually in `components/nes/roms.ts`.
// ═════════════════════════════════════════════════════════════

import type { Rom } from "./types";

export const LOCAL_ROMS: Rom[] = [
    {
        id: "nova",
        title: "Nova the Squirrel",
        description: "A cute homebrew platformer starring a blue squirrel.",
        author: { name: "NovaSquirrel", url: "https://github.com/NovaSquirrel/NovaTheSquirrel" },
        url: "/roms/nova/nova.nes",
        sizeBytes: 262160,
    },
];
