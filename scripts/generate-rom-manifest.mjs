/**
 * generate-rom-manifest.mjs
 *
 * Scans `public/roms/` for subdirectories containing `.nes` files and
 * auto-generates `components/nes/roms.ts`.
 *
 * Usage:
 *   node scripts/generate-rom-manifest.mjs
 *
 * Each subdirectory becomes one ROM entry:
 *   public/roms/<id>/<file>.nes
 *
 * Optional metadata.json in the subdirectory:
 *   { "title": "Display Name", "description": "Optional description" }
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const ROMS_DIR = path.join(PROJECT_ROOT, "public", "roms");
const OUTPUT_FILE = path.join(
    PROJECT_ROOT,
    "components",
    "nes",
    "roms.generated.ts",
);

main();

function main() {
    // Ensure public/roms exists.
    if (!fs.existsSync(ROMS_DIR)) {
        console.log("⚠  public/roms/ does not exist — nothing to generate.");
        writeGeneratedFile([]);
        return;
    }

    const entries = fs.readdirSync(ROMS_DIR, { withFileTypes: true });
    const subdirs = entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();

    const roms = [];

    for (const dir of subdirs) {
        const dirPath = path.join(ROMS_DIR, dir);
        const files = fs
            .readdirSync(dirPath)
            .filter((f) => f.toLowerCase().endsWith(".nes"));

        if (files.length === 0) {
            console.log(`  ⚠  ${dir}/ — no .nes files found, skipping`);
            continue;
        }

        // Use the first .nes file found.
        const nesFile = files[0];
        const fullPath = path.join(dirPath, nesFile);
        const stat = fs.statSync(fullPath);
        const url = `/roms/${dir}/${nesFile}`;

        // Optional metadata.json.
        const metaPath = path.join(dirPath, "metadata.json");
        let title = dir;
        let description = undefined;
        let author = undefined;
        if (fs.existsSync(metaPath)) {
            try {
                const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
                if (meta.title) title = meta.title;
                if (meta.description) description = meta.description;
                if (meta.author && meta.author.name && meta.author.url) {
                    author = {
                        name: meta.author.name,
                        url: meta.author.url,
                    };
                }
            } catch (err) {
                console.log(
                    `  ⚠  ${dir}/metadata.json — parse failed: ${err.message}`,
                );
            }
        }

        roms.push({
            id: dir,
            title,
            description,
            author,
            url,
            sizeBytes: stat.size,
        });
        console.log(`  ✓  ${dir}/ — ${stat.size} bytes (${title})`);
    }

    console.log(`\n  Total: ${roms.length} ROM(s) found`);
    writeGeneratedFile(roms);
}

function writeGeneratedFile(roms) {
    const lines = [
        "// ═════════════════════════════════════════════════════════════",
        "// This file is auto-generated — do not edit by hand.",
        "// Regenerate with:  node scripts/generate-rom-manifest.mjs",
        "//                    npm run generate-roms",
        "//",
        "// Exposes LOCAL_ROMS (files in public/roms/). Remote ROMs are",
        "// configured manually in `components/nes/roms.ts`.",
        "// ═════════════════════════════════════════════════════════════",
        "",
        'import type { Rom } from "./types";',
        "",
        "export const LOCAL_ROMS: Rom[] = [",
    ];

    for (const rom of roms) {
        const desc = rom.description
            ? `\n        description: ${JSON.stringify(rom.description)},`
            : "";
        const author = rom.author
            ? `\n        author: { name: ${JSON.stringify(rom.author.name)}, url: ${JSON.stringify(rom.author.url)} },`
            : "";
        lines.push(
            `    {\n` +
                `        id: ${JSON.stringify(rom.id)},\n` +
                `        title: ${JSON.stringify(rom.title)},${desc}${author}\n` +
                `        url: ${JSON.stringify(rom.url)},\n` +
                `        sizeBytes: ${rom.sizeBytes},\n` +
                `    },`,
        );
    }

    lines.push("];\n");

    fs.writeFileSync(OUTPUT_FILE, lines.join("\n"), "utf-8");
    console.log(
        `\n  ✍  Generated: ${path.relative(PROJECT_ROOT, OUTPUT_FILE)}`,
    );
}
