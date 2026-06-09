// Shared types for the NES emulator components.

export interface Rom {
    /** Stable id used as the React key and the public/roms folder name. */
    id: string;
    /** Display name shown in the picker. */
    title: string;
    /** Optional one-line description. */
    description?: string;
    /**
     * Public URL to the .nes file. Typically something like
     * `/roms/<id>/<file>.nes` served from the Next.js `public/` directory.
     */
    url: string;
    /** File size in bytes, if known. Used for the meta line in the picker. */
    sizeBytes?: number;
    /** Optional attribution shown in the picker as a link. */
    author?: { name: string; url: string };
}

/** Status of a ROM load attempt. */
export type LoadStatus =
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "ready" }
    | { kind: "error"; message: string };
