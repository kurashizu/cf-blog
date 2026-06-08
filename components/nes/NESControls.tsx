"use client";

import { useCallback, useEffect, useRef } from "react";
import { Controller, type ButtonKey } from "jsnes";

/**
 * On-screen NES controller — D-pad + A/B + Start/Select. Works with both
 * mouse and touch via pointer events. The `browser` prop is the live
 * `jsnes.Browser` instance, owned by NESPanel; we call `browser.nes.buttonDown`
 * / `buttonUp` directly. The keyboard path is handled by JSNES itself
 * (Browser.constructor wires a document-level listener).
 */
interface NESControlsProps {
    browser: import("jsnes").Browser | null;
    disabled?: boolean;
    /** Set of NES button keys currently held by the keyboard. The
     *  corresponding on-screen buttons light up while a key is held,
     *  matching the visual feedback of touch/pointer presses. */
    pressedKeys?: Set<ButtonKey>;
}

const PLAYER = 1 as const;

type Dir = "up" | "down" | "left" | "right";
const DIR_BUTTONS: Record<Dir, ButtonKey> = {
    up: Controller.BUTTON_UP,
    down: Controller.BUTTON_DOWN,
    left: Controller.BUTTON_LEFT,
    right: Controller.BUTTON_RIGHT,
};

function DPadButton({
    area,
    label,
    disabled,
    onPressChange,
    isPressed,
}: {
    area: Dir;
    label: string;
    disabled?: boolean;
    onPressChange: (pressed: boolean) => void;
    isPressed?: boolean;
}) {
    const pressedRef = useRef(false);

    const press = useCallback(
        (e: React.PointerEvent<HTMLButtonElement>) => {
            if (disabled) return;
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            if (!pressedRef.current) {
                pressedRef.current = true;
                onPressChange(true);
            }
        },
        [disabled, onPressChange],
    );

    const release = useCallback(
        (e: React.PointerEvent<HTMLButtonElement>) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
            }
            if (pressedRef.current) {
                pressedRef.current = false;
                onPressChange(false);
            }
        },
        [onPressChange],
    );

    const cancel = useCallback(
        (e: React.PointerEvent<HTMLButtonElement>) => {
            // Lost capture (e.g. gesture cancelled) — treat as release.
            if (pressedRef.current) {
                pressedRef.current = false;
                onPressChange(false);
            }
        },
        [onPressChange],
    );

    return (
        <button
            type="button"
            data-area={area}
            className={`nes-dpad-btn${isPressed ? " is-pressed" : ""}`}
            aria-label={label}
            disabled={disabled}
            onPointerDown={press}
            onPointerUp={release}
            onPointerCancel={cancel}
            onContextMenu={(e) => e.preventDefault()}
        >
            {arrowGlyph(area)}
        </button>
    );
}

function arrowGlyph(d: Dir): string {
    return d === "up" ? "▲" : d === "down" ? "▼" : d === "left" ? "◀" : "▶";
}

function CircleButton({
    label,
    buttonKey,
    variant,
    disabled,
    onPressChange,
    isPressed,
}: {
    label: string;
    buttonKey: ButtonKey;
    variant: "a" | "b";
    disabled?: boolean;
    onPressChange: (btn: ButtonKey, pressed: boolean) => void;
    isPressed?: boolean;
}) {
    const pressedRef = useRef(false);

    const press = (e: React.PointerEvent<HTMLButtonElement>) => {
        if (disabled) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        if (!pressedRef.current) {
            pressedRef.current = true;
            onPressChange(buttonKey, true);
        }
    };

    const release = (e: React.PointerEvent<HTMLButtonElement>) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
        }
        if (pressedRef.current) {
            pressedRef.current = false;
            onPressChange(buttonKey, false);
        }
    };

    return (
        <button
            type="button"
            className={`nes-ab-btn ${variant === "b" ? "is-b" : ""}${
                isPressed ? " is-pressed" : ""
            }`}
            aria-label={label}
            disabled={disabled}
            onPointerDown={press}
            onPointerUp={release}
            onPointerCancel={() => {
                if (pressedRef.current) {
                    pressedRef.current = false;
                    onPressChange(buttonKey, false);
                }
            }}
            onContextMenu={(e) => e.preventDefault()}
        >
            {label}
        </button>
    );
}

function MetaButton({
    label,
    buttonKey,
    disabled,
    onPressChange,
    isPressed,
}: {
    label: string;
    buttonKey: ButtonKey;
    disabled?: boolean;
    onPressChange: (btn: ButtonKey, pressed: boolean) => void;
    isPressed?: boolean;
}) {
    return (
        <button
            type="button"
            className={`nes-meta-btn${isPressed ? " is-pressed" : ""}`}
            aria-label={label}
            disabled={disabled}
            onPointerDown={(e) => {
                if (disabled) return;
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                onPressChange(buttonKey, true);
            }}
            onPointerUp={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                }
                onPressChange(buttonKey, false);
            }}
            onPointerCancel={() => onPressChange(buttonKey, false)}
            onContextMenu={(e) => e.preventDefault()}
        >
            {label}
        </button>
    );
}

export function NESControls({
    browser,
    disabled,
    pressedKeys,
}: NESControlsProps) {
    // Send a button event to the underlying NES. Safe to call even when the
    // browser hasn't loaded a ROM yet — JSNES just queues the state and the
    // next frame picks it up.
    const send = useCallback(
        (key: ButtonKey, pressed: boolean) => {
            if (!browser) return;
            if (pressed) browser.nes.buttonDown(PLAYER, key);
            else browser.nes.buttonUp(PLAYER, key);
        },
        [browser],
    );

    // Release everything if the component unmounts mid-press.
    useEffect(() => {
        return () => {
            if (!browser) return;
            (Object.values(DIR_BUTTONS) as ButtonKey[]).forEach((k) =>
                browser.nes.buttonUp(PLAYER, k),
            );
            browser.nes.buttonUp(PLAYER, Controller.BUTTON_A);
            browser.nes.buttonUp(PLAYER, Controller.BUTTON_B);
            browser.nes.buttonUp(PLAYER, Controller.BUTTON_START);
            browser.nes.buttonUp(PLAYER, Controller.BUTTON_SELECT);
        };
    }, [browser]);

    return (
        <div className="nes-controls">
            <div className="nes-dpad">
                {(["up", "left", "down", "right"] as Dir[]).map((d) => (
                    <DPadButton
                        key={d}
                        area={d}
                        label={d}
                        disabled={disabled}
                        isPressed={pressedKeys?.has(DIR_BUTTONS[d]) ?? false}
                        onPressChange={(pressed) =>
                            send(DIR_BUTTONS[d], pressed)
                        }
                    />
                ))}
                <div className="nes-dpad-btn" data-area="center" aria-hidden />
            </div>

            <div className="nes-ab">
                <CircleButton
                    label="B"
                    buttonKey={Controller.BUTTON_B}
                    variant="b"
                    disabled={disabled}
                    isPressed={pressedKeys?.has(Controller.BUTTON_B) ?? false}
                    onPressChange={send}
                />
                <CircleButton
                    label="A"
                    buttonKey={Controller.BUTTON_A}
                    variant="a"
                    disabled={disabled}
                    isPressed={pressedKeys?.has(Controller.BUTTON_A) ?? false}
                    onPressChange={send}
                />
            </div>

            <div className="nes-meta">
                <MetaButton
                    label="Select"
                    buttonKey={Controller.BUTTON_SELECT}
                    disabled={disabled}
                    isPressed={
                        pressedKeys?.has(Controller.BUTTON_SELECT) ?? false
                    }
                    onPressChange={send}
                />
                <MetaButton
                    label="Start"
                    buttonKey={Controller.BUTTON_START}
                    disabled={disabled}
                    isPressed={
                        pressedKeys?.has(Controller.BUTTON_START) ?? false
                    }
                    onPressChange={send}
                />
            </div>
        </div>
    );
}
