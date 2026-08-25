"use client";

/**
 * Ref-counted body scroll lock shared by every full-screen modal.
 *
 * Why ref-counted: two modals can overlap (e.g. the guestbook modal open
 * while the LLM leaderboard opens on top). Naive `overflow = ""` restores
 * on close would unlock scrolling while the other modal is still open.
 *
 * The lock also broadcasts a `modal-lock-change` window event. The ambient
 * background effects (ParticleBackground, MouseTrail) listen for it and
 * pause while any modal is open — repainting a canvas underneath a
 * `backdrop-blur` overlay forces the compositor to re-blur every frame,
 * which visibly steals frame time from things like the NES emulator.
 */
import { useEffect } from "react";

export const MODAL_LOCK_EVENT = "modal-lock-change";

let lockCount = 0;
let previousOverflow = "";

export function isModalLocked(): boolean {
    return lockCount > 0;
}

function broadcast(locked: boolean) {
    window.dispatchEvent(
        new CustomEvent(MODAL_LOCK_EVENT, { detail: { locked } }),
    );
}

export function acquireModalLock(): void {
    lockCount++;
    if (lockCount === 1) {
        previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        broadcast(true);
    }
}

export function releaseModalLock(): void {
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
        document.body.style.overflow = previousOverflow;
        broadcast(false);
    }
}

/** Hold the body scroll lock while `active` is true. */
export function useModalLock(active: boolean): void {
    useEffect(() => {
        if (!active) return;
        acquireModalLock();
        return () => releaseModalLock();
    }, [active]);
}
