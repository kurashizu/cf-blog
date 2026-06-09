"use client";

import { useRef } from "react";
import type { Rom } from "./types";
import { LOCAL_ROMS, REMOTE_ROMS } from "./roms";

interface NESRomPickerProps {
    currentRomId: string | null;
    onSelectBuiltIn: (rom: Rom) => void;
    /** Receives the filename and a binary string (x-user-defined encoding) so
     *  it can be passed straight to `Browser.loadROM()`. */
    onSelectFile: (filename: string, data: string) => void;
    disabled?: boolean;
}

function formatSize(bytes?: number): string {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function NESRomPicker({
    currentRomId,
    onSelectBuiltIn,
    onSelectFile,
    disabled,
}: NESRomPickerProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        // Binary string matches the x-user-defined XHR trick used by JSNES's
        // own Browser.loadROMFromURL — bytes are preserved 1:1.
        reader.onload = () => {
            if (typeof reader.result === "string") {
                onSelectFile(file.name, reader.result);
            }
        };
        reader.readAsBinaryString(file);
        // Reset so the same file can be re-selected.
        e.target.value = "";
    };

    const hasAny = LOCAL_ROMS.length > 0 || REMOTE_ROMS.length > 0;

    return (
        <div className="nes-picker">
            <h3 className="nes-picker-title">ROM Library</h3>

            {!hasAny ? (
                <div className="nes-rom-empty">
                    No built-in ROMs.
                    <br />
                    Drop <code>.nes</code> files in <code>public/roms/</code> or
                    add entries to <code>components/nes/roms.ts</code>.
                </div>
            ) : (
                <>
                    {LOCAL_ROMS.length > 0 && (
                        <RomSection
                            label="Built-in"
                            roms={LOCAL_ROMS}
                            currentRomId={currentRomId}
                            onSelectBuiltIn={onSelectBuiltIn}
                            disabled={disabled}
                        />
                    )}
                    {REMOTE_ROMS.length > 0 && (
                        <RomSection
                            label="From URL"
                            roms={REMOTE_ROMS}
                            currentRomId={currentRomId}
                            onSelectBuiltIn={onSelectBuiltIn}
                            disabled={disabled}
                            showUrlBadge
                        />
                    )}
                </>
            )}

            <label className="nes-upload" aria-disabled={disabled}>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".nes,application/octet-stream"
                    disabled={disabled}
                    onChange={handleFile}
                />
                <span>📁 Upload .nes file</span>
            </label>
        </div>
    );
}

function RomSection({
    label,
    roms,
    currentRomId,
    onSelectBuiltIn,
    disabled,
    showUrlBadge = false,
}: {
    label: string;
    roms: Rom[];
    currentRomId: string | null;
    onSelectBuiltIn: (rom: Rom) => void;
    disabled?: boolean;
    showUrlBadge?: boolean;
}) {
    return (
        <div className="nes-rom-section">
            <div className="nes-rom-section-label">{label}</div>
            <div className="nes-rom-list" role="list">
                {roms.map((rom) => (
                    <button
                        key={rom.id}
                        type="button"
                        className={`nes-rom-item${
                            currentRomId === rom.id ? " is-active" : ""
                        }`}
                        disabled={disabled}
                        onClick={() => onSelectBuiltIn(rom)}
                        role="listitem"
                    >
                        <div className="nes-rom-info">
                            <div className="nes-rom-title">{rom.title}</div>
                            {rom.description && (
                                <div className="nes-rom-desc">
                                    {rom.description}
                                </div>
                            )}
                            {rom.author && (
                                <div className="nes-rom-author">
                                    by{" "}
                                    <a
                                        href={rom.author.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {rom.author.name}
                                    </a>
                                </div>
                            )}
                        </div>
                        {rom.sizeBytes !== undefined ? (
                            <span className="nes-rom-meta">
                                {formatSize(rom.sizeBytes)}
                            </span>
                        ) : (
                            showUrlBadge && (
                                <span className="nes-rom-meta" title={rom.url}>
                                    🌐 URL
                                </span>
                            )
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
}
