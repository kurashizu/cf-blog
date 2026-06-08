"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Browser, Controller, type ButtonKey } from "jsnes";
import { NESBrowser } from "./NESBrowser";
import { NESControls } from "./NESControls";
import { NESRomPicker } from "./NESRomPicker";
import type { Rom, LoadStatus } from "./types";

interface NESPanelProps {
    /** Whether the modal is open. Fully controlled — see GadgetsPanel. */
    expanded: boolean;
    onExpand?: () => void;
    onCollapse: () => void;
}

const PLAYER = 1 as const;

// The published JSNES typings only expose `keys / loadKeys / setKeys` on
// Browser.keyboard, but the runtime class also defines the event handlers
// we need to detach (see JSNES's own src/browser/keyboard.js). Cast to
// the wider type so we can call removeEventListener on them.
type KeyboardHandlers = {
    handleKeyDown: (e: KeyboardEvent) => void;
    handleKeyUp: (e: KeyboardEvent) => void;
    handleKeyPress: (e: KeyboardEvent) => void;
};

// Physical-key mapping using the modern `e.code` property (layout- and
// browser-independent). Replaces JSNES's built-in `e.keyCode` mapping,
// which returns 0 for letter keys in Safari.
const KEY_MAP: Record<string, ButtonKey> = {
    KeyW: Controller.BUTTON_UP,
    KeyA: Controller.BUTTON_LEFT,
    KeyS: Controller.BUTTON_DOWN,
    KeyD: Controller.BUTTON_RIGHT,
    KeyK: Controller.BUTTON_A,
    KeyL: Controller.BUTTON_B,
    KeyI: Controller.BUTTON_START,
    KeyO: Controller.BUTTON_SELECT,
};

const SLOT_COUNT = 5;

type SlotEntry = { ts: number } | null;

function getSaveKey(romId: string, slotNum: number): string {
    return `nes-save:${romId}:slot${slotNum}`;
}

function formatRelativeTime(ts: number): string {
    const diff = Date.now() - ts;
    const s = Math.floor(diff / 1000);
    if (s < 60) return "just now";
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(ts).toLocaleDateString();
}

export function NESPanel({ expanded, onExpand, onCollapse }: NESPanelProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const browserRef = useRef<Browser | null>(null);
    const [currentRom, setCurrentRom] = useState<Rom | null>(null);
    const [status, setStatus] = useState<LoadStatus>({ kind: "idle" });
    const [paused, setPaused] = useState(false);
    const [closing, setClosing] = useState(false);
    // 5 save slots for the current ROM. `null` = empty. Each entry holds
    // the save's timestamp so the panel can show "2m ago" / "empty".
    const [slots, setSlots] = useState<SlotEntry[]>(() =>
        Array(SLOT_COUNT).fill(null),
    );
    const [toast, setToast] = useState<string | null>(null);
    // Set of NES button keys currently held by the keyboard. Read by
    // NESControls to light up the matching on-screen buttons.
    const [pressedButtons, setPressedButtons] = useState<Set<ButtonKey>>(
        () => new Set(),
    );
    // Refs to the latest save/load-slot callbacks so the keyboard
    // listener (registered once when the modal opens) always dispatches
    // to the current closures, not the stale ones captured at effect
    // time.
    const handleSaveSlotRef = useRef<((n: number) => void) | null>(null);
    const handleLoadSlotRef = useRef<((n: number) => void) | null>(null);
    // Most-recently-used slot. The `,` / `.` shortcuts target this slot
    // so quick-save always lands in the slot the user just saved to.
    const lastUsedSlotRef = useRef(1);

    // Spin up the Browser when the modal opens, tear it down on close.
    // JSNES attaches a document-level keyboard listener in its constructor
    // and an AudioContext in start(), so we MUST destroy() on unmount or we
    // leak both.
    useEffect(() => {
        if (!expanded || !containerRef.current) return;
        const browser = new Browser({
            container: containerRef.current,
            onError: (e) => setStatus({ kind: "error", message: e.message }),
        });
        // JSNES's built-in keyboard handler reads the deprecated
        // `e.keyCode` property, which Safari returns inconsistently
        // (often 0 for letter keys). We install our own handler below
        // that uses the modern `e.code` property, so disable JSNES's
        // to avoid double-firing.
        const kb = browser.keyboard as unknown as KeyboardHandlers;
        document.removeEventListener("keydown", kb.handleKeyDown);
        document.removeEventListener("keyup", kb.handleKeyUp);
        document.removeEventListener("keypress", kb.handleKeyPress);
        browserRef.current = browser;
        return () => {
            browser.destroy();
            browserRef.current = null;
        };
    }, [expanded]);

    // Custom keyboard handler. Uses `e.code` (layout-independent physical
    // key identifier) and the JSNES Controller constants directly, so it
    // works in every modern browser including Safari.
    useEffect(() => {
        if (!expanded) return;

        const handleKey = (e: KeyboardEvent, pressed: boolean) => {
            // Don't intercept typing in form fields (file picker, search
            // box, chat input, etc.) — let those keys reach the input.
            const target = e.target as HTMLElement | null;
            if (
                target &&
                (target.tagName === "INPUT" ||
                    target.tagName === "TEXTAREA" ||
                    target.isContentEditable)
            ) {
                return;
            }

            // Quick save / quick load shortcuts (fire only on keydown,
            // not on keyup or auto-repeat). Routed through refs so we
            // always call the latest closure even though this listener
            // is registered only once per `expanded` flip.
            if (pressed) {
                if (e.code === "Comma") {
                    e.preventDefault();
                    handleSaveSlotRef.current?.(lastUsedSlotRef.current);
                    return;
                }
                if (e.code === "Period") {
                    e.preventDefault();
                    handleLoadSlotRef.current?.(lastUsedSlotRef.current);
                    return;
                }
            }

            const btn = KEY_MAP[e.code];
            if (btn === undefined) return;
            const browser = browserRef.current;
            if (!browser) return;
            e.preventDefault();
            if (pressed) {
                browser.nes.buttonDown(PLAYER, btn);
                setPressedButtons((prev) => {
                    if (prev.has(btn)) return prev;
                    const next = new Set(prev);
                    next.add(btn);
                    return next;
                });
            } else {
                browser.nes.buttonUp(PLAYER, btn);
                setPressedButtons((prev) => {
                    if (!prev.has(btn)) return prev;
                    const next = new Set(prev);
                    next.delete(btn);
                    return next;
                });
            }
        };

        const handleDown = (e: KeyboardEvent) => handleKey(e, true);
        const handleUp = (e: KeyboardEvent) => handleKey(e, false);

        document.addEventListener("keydown", handleDown);
        document.addEventListener("keyup", handleUp);
        return () => {
            document.removeEventListener("keydown", handleDown);
            document.removeEventListener("keyup", handleUp);
        };
    }, [expanded]);

    // Reset transient state when the modal closes.
    useEffect(() => {
        if (!expanded) {
            if (status.kind !== "idle") setStatus({ kind: "idle" });
            setPaused(false);
            // Drop any keys the user was holding when the modal closed,
            // so the on-screen buttons don't appear stuck on reopen.
            setPressedButtons(new Set());
        }
    }, [expanded, status.kind]);

    // ESC to close.
    useEffect(() => {
        if (!expanded) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") handleClose();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [expanded]);

    // Auto-resize the canvas whenever the window resizes — JSNES measures
    // via its container's client size, so any layout shift needs a nudge.
    useEffect(() => {
        if (!expanded) return;
        const onResize = () => browserRef.current?.fitInParent();
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [expanded]);

    // Load the 5 save slots for the current ROM. Each slot is parsed
    // for its timestamp so the panel can show "2m ago" / "empty".
    useEffect(() => {
        if (!currentRom || typeof window === "undefined") {
            setSlots(Array(SLOT_COUNT).fill(null));
            return;
        }
        const loaded: SlotEntry[] = [];
        for (let i = 1; i <= SLOT_COUNT; i++) {
            try {
                const raw = localStorage.getItem(getSaveKey(currentRom.id, i));
                if (raw) {
                    const parsed = JSON.parse(raw);
                    loaded.push(
                        typeof parsed.ts === "number" && parsed.state
                            ? { ts: parsed.ts }
                            : null,
                    );
                } else {
                    loaded.push(null);
                }
            } catch {
                loaded.push(null);
            }
        }
        setSlots(loaded);
    }, [currentRom]);

    const showToast = useCallback((msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 1500);
    }, []);

    // Keep save/load handler refs in sync with the latest closures.
    useEffect(() => {
        handleSaveSlotRef.current = handleSaveSlot;
        handleLoadSlotRef.current = handleLoadSlot;
    });

    const loadRom = useCallback((rom: Rom) => {
        if (!browserRef.current) return;
        setCurrentRom(rom);
        setStatus({ kind: "loading" });
        setPaused(false);
        Browser.loadROMFromURL(rom.url, (err, data) => {
            if (err || !data) {
                setStatus({
                    kind: "error",
                    message: err?.message ?? "Failed to load ROM",
                });
                return;
            }
            browserRef.current?.loadROM(data);
            setStatus({ kind: "ready" });
        });
    }, []);

    const handleSelectFile = useCallback((filename: string, data: string) => {
        if (!browserRef.current) return;
        const rom: Rom = {
            id: `upload:${filename}`,
            title: filename,
            url: "",
        };
        setCurrentRom(rom);
        setStatus({ kind: "loading" });
        setPaused(false);
        try {
            browserRef.current.loadROM(data);
            setStatus({ kind: "ready" });
        } catch (e) {
            setStatus({
                kind: "error",
                message: e instanceof Error ? e.message : "Invalid ROM",
            });
        }
    }, []);

    const handleReset = () => {
        if (!browserRef.current || status.kind !== "ready") return;
        browserRef.current.nes.reset();
    };

    const handleReload = () => {
        if (!browserRef.current) return;
        // For built-in ROMs re-fetch; for uploads just replay the current one.
        if (currentRom && !currentRom.id.startsWith("upload:")) {
            loadRom(currentRom);
        } else {
            browserRef.current.nes.reloadROM();
        }
    };

    const handleTogglePause = () => {
        if (!browserRef.current || status.kind !== "ready") return;
        if (paused) {
            browserRef.current.start();
            setPaused(false);
        } else {
            browserRef.current.stop();
            setPaused(true);
        }
    };

    const handleSaveSlot = useCallback(
        (slotNum: number) => {
            if (!browserRef.current || !currentRom) return;
            try {
                // JSNES's toJSON() snapshots CPU/PPU/mmap/PAPU/controller
                // state but NOT the ROM (see
                // node_modules/jsnes/src/nes.js:178), so each save is
                // implicitly tied to the ROM it's saved under.
                const state = browserRef.current.nes.toJSON();
                const payload = { ts: Date.now(), state };
                localStorage.setItem(
                    getSaveKey(currentRom.id, slotNum),
                    JSON.stringify(payload),
                );
                setSlots((prev) => {
                    const next = [...prev];
                    next[slotNum - 1] = { ts: payload.ts };
                    return next;
                });
                lastUsedSlotRef.current = slotNum;
                showToast(`✓ Saved to slot ${slotNum}`);
            } catch {
                showToast("✗ Save failed");
            }
        },
        [currentRom, showToast],
    );

    const handleLoadSlot = useCallback(
        (slotNum: number) => {
            if (!browserRef.current || !currentRom) return;
            const raw = localStorage.getItem(
                getSaveKey(currentRom.id, slotNum),
            );
            if (!raw) return;
            try {
                const parsed = JSON.parse(raw);
                if (!parsed.state) throw new Error("Invalid save data");
                // Briefly stop the frame loop so the restored state
                // doesn't emit a partial frame into the audio buffer.
                const wasRunning = !paused && status.kind === "ready";
                if (wasRunning) browserRef.current.stop();
                browserRef.current.nes.fromJSON(parsed.state);
                if (wasRunning) browserRef.current.start();
                lastUsedSlotRef.current = slotNum;
                showToast(`✓ Loaded from slot ${slotNum}`);
            } catch {
                showToast("✗ Load failed");
            }
        },
        [currentRom, paused, status, showToast],
    );

    const handleClose = useCallback(() => {
        if (closing) return;
        setClosing(true);
        setTimeout(() => {
            setClosing(false);
            onCollapse();
        }, 200);
    }, [closing, onCollapse]);

    const isReady = status.kind === "ready";
    const currentTitle = currentRom?.title;

    if (typeof document === "undefined") return null;
    if (!expanded && !closing) return null;

    return createPortal(
        <div
            className={`fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 bg-black/60 backdrop-blur-sm ${
                closing ? "animate-fadeOut" : "animate-fadeIn"
            }`}
            onClick={(e) => {
                if (e.target === e.currentTarget) handleClose();
            }}
        >
            <div
                className={`bg-bg-card/95 border border-border rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden ${
                    closing ? "animate-slideDown" : "animate-scaleIn"
                }`}
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex items-start justify-between p-5 border-b border-border shrink-0">
                    <div>
                        <h2
                            className="text-2xl font-bold text-text-primary"
                            style={{ fontFamily: "Pacifico, cursive" }}
                        >
                            NES Emulator
                        </h2>
                        <p className="text-sm text-text-muted mt-0.5">
                            Play a ROM in your browser · keyboard + touch
                        </p>
                    </div>
                    <button
                        onClick={handleClose}
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors"
                        aria-label="Close"
                    >
                        <svg
                            className="w-5 h-5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                        >
                            <path
                                d="M6 6l12 12M18 6L6 18"
                                strokeLinecap="round"
                            />
                        </svg>
                    </button>
                </header>

                <div className="p-5 flex-1 overflow-auto">
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-6">
                        <div className="flex flex-col items-center">
                            <NESBrowser
                                ref={containerRef}
                                status={status}
                                currentRomTitle={currentTitle}
                            />

                            <div className="nes-toolbar">
                                <button
                                    type="button"
                                    className="nes-toolbar-btn"
                                    onClick={handleReset}
                                    disabled={!isReady}
                                >
                                    ↺ Reset
                                </button>
                                <button
                                    type="button"
                                    className="nes-toolbar-btn"
                                    onClick={handleTogglePause}
                                    disabled={!isReady}
                                >
                                    {paused ? "▶ Resume" : "❚❚ Pause"}
                                </button>
                                <button
                                    type="button"
                                    className="nes-toolbar-btn"
                                    onClick={handleReload}
                                    disabled={!isReady}
                                >
                                    ⟳ Reload
                                </button>
                            </div>
                            {toast && <div className="nes-toast">{toast}</div>}

                            <NESControls
                                browser={browserRef.current}
                                disabled={!isReady}
                                pressedKeys={pressedButtons}
                            />
                        </div>

                        <div className="flex flex-col">
                            <NESRomPicker
                                currentRomId={currentRom?.id ?? null}
                                onSelectBuiltIn={loadRom}
                                onSelectFile={handleSelectFile}
                                disabled={false}
                            />

                            <div
                                className="nes-picker"
                                style={{ marginTop: 16 }}
                            >
                                <h3 className="nes-picker-title">Status</h3>
                                <div className="nes-status-grid">
                                    <div className="nes-status-label">ROM</div>
                                    <div className="nes-status-value">
                                        {currentTitle ?? "—"}
                                    </div>
                                    <div className="nes-status-label">
                                        State
                                    </div>
                                    <div className="nes-status-value">
                                        {status.kind === "idle" && "Idle"}
                                        {status.kind === "loading" &&
                                            "Loading…"}
                                        {status.kind === "ready" &&
                                            (paused ? "Paused" : "Running")}
                                        {status.kind === "error" && "Error"}
                                    </div>
                                </div>
                            </div>

                            <div
                                className="nes-picker"
                                style={{ marginTop: 16 }}
                            >
                                <h3 className="nes-picker-title">Controls</h3>
                                <div className="nes-controls-help">
                                    <div className="nes-controls-help-row">
                                        <span className="nes-controls-help-action">
                                            D-Pad
                                        </span>
                                        <span className="nes-controls-help-keys">
                                            <kbd className="nes-kbd">W</kbd>
                                            <kbd className="nes-kbd">A</kbd>
                                            <kbd className="nes-kbd">S</kbd>
                                            <kbd className="nes-kbd">D</kbd>
                                        </span>
                                    </div>
                                    <div className="nes-controls-help-row">
                                        <span className="nes-controls-help-action">
                                            A
                                        </span>
                                        <span className="nes-controls-help-keys">
                                            <kbd className="nes-kbd">K</kbd>
                                        </span>
                                    </div>
                                    <div className="nes-controls-help-row">
                                        <span className="nes-controls-help-action">
                                            B
                                        </span>
                                        <span className="nes-controls-help-keys">
                                            <kbd className="nes-kbd">L</kbd>
                                        </span>
                                    </div>
                                    <div className="nes-controls-help-row">
                                        <span className="nes-controls-help-action">
                                            Start
                                        </span>
                                        <span className="nes-controls-help-keys">
                                            <kbd className="nes-kbd">I</kbd>
                                        </span>
                                    </div>
                                    <div className="nes-controls-help-row">
                                        <span className="nes-controls-help-action">
                                            Select
                                        </span>
                                        <span className="nes-controls-help-keys">
                                            <kbd className="nes-kbd">O</kbd>
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div
                                className="nes-picker"
                                style={{ marginTop: 16 }}
                            >
                                <h3 className="nes-picker-title">Saves</h3>
                                <div className="nes-slots">
                                    {Array.from(
                                        { length: SLOT_COUNT },
                                        (_, i) => i + 1,
                                    ).map((slotNum) => {
                                        const slot = slots[slotNum - 1];
                                        return (
                                            <div
                                                key={slotNum}
                                                className={`nes-slot-row${
                                                    slot ? " is-filled" : ""
                                                }`}
                                            >
                                                <span className="nes-slot-num">
                                                    {slotNum}
                                                </span>
                                                <span className="nes-slot-status">
                                                    {slot
                                                        ? formatRelativeTime(
                                                              slot.ts,
                                                          )
                                                        : "empty"}
                                                </span>
                                                <button
                                                    type="button"
                                                    className="nes-slot-btn"
                                                    onClick={() =>
                                                        handleSaveSlot(slotNum)
                                                    }
                                                    disabled={!isReady}
                                                    title={`Save to slot ${slotNum}`}
                                                >
                                                    💾
                                                </button>
                                                <button
                                                    type="button"
                                                    className="nes-slot-btn"
                                                    onClick={() =>
                                                        handleLoadSlot(slotNum)
                                                    }
                                                    disabled={!isReady || !slot}
                                                    title={
                                                        slot
                                                            ? `Load slot ${slotNum}`
                                                            : `Slot ${slotNum} is empty`
                                                    }
                                                >
                                                    📂
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}
