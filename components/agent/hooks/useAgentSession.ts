/**
 * useAgentSession — owns the list of saved sessions and the active session id.
 * Persistence is delegated to `storage.ts`; this hook just exposes a clean
 * React API for create / switch / delete.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import {
    deleteStoredMessages,
    getActiveSessionId,
    loadMessages,
    loadSessions,
    MAX_SESSIONS,
    saveMessages,
    saveSessions,
    setActiveSessionId as persistActiveId,
} from "../storage";
import type { Message, SessionMeta } from "../types";

export function useAgentSession() {
    const [sessions, setSessions] = useState<SessionMeta[]>([]);
    const [activeId, setActiveId] = useState<string>("");
    const [activeMessages, setActiveMessages] = useState<Message[]>([]);

    // Mount: hydrate from localStorage.
    useEffect(() => {
        const loaded = loadSessions();
        setSessions(loaded);
        const id = getActiveSessionId();
        setActiveId(id);
        if (id) setActiveMessages(loadMessages(id));
    }, []);

    // Persist messages whenever they change (and we know which session owns them).
    useEffect(() => {
        if (activeId) saveMessages(activeId, activeMessages);
    }, [activeId, activeMessages]);

    const createNew = useCallback((): string => {
        const id = crypto.randomUUID();
        const now = Date.now();
        const newSession: SessionMeta = {
            id,
            createdAt: now,
            lastActiveAt: now,
            title: "New conversation",
        };
        setSessions((prev) => {
            const updated = [newSession, ...prev].slice(0, MAX_SESSIONS);
            saveSessions(updated);
            return updated;
        });
        setActiveId(id);
        persistActiveId(id);
        setActiveMessages([]);
        return id;
    }, []);

    const switchTo = useCallback((id: string) => {
        setActiveId(id);
        persistActiveId(id);
        setActiveMessages(loadMessages(id));
    }, []);

    const remove = useCallback(
        (id: string) => {
            deleteStoredMessages(id);
            setSessions((prev) => {
                const updated = prev.filter((s) => s.id !== id);
                saveSessions(updated);
                return updated;
            });
            if (activeId === id) {
                setActiveMessages([]);
                const next = sessions.find((s) => s.id !== id);
                if (next) {
                    switchTo(next.id);
                } else {
                    createNew();
                }
            }
        },
        [activeId, sessions, createNew, switchTo],
    );

    /**
     * Update the active session's metadata (title / lastActiveAt). Called
     * after a successful send so the sidebar reflects "just now" and so the
     * first user message can be used as a conversation title.
     */
    const touchActive = useCallback(
        (titleHint?: string) => {
            setSessions((prev) => {
                const updated = prev.map((s) =>
                    s.id === activeId
                        ? {
                              ...s,
                              lastActiveAt: Date.now(),
                              title:
                                  titleHint ||
                                  (s.title === "New conversation"
                                      ? ""
                                      : s.title),
                          }
                        : s,
                );
                saveSessions(updated);
                return updated;
            });
        },
        [activeId],
    );

    return {
        sessions,
        activeId,
        activeMessages,
        setActiveMessages,
        createNew,
        switchTo,
        remove,
        touchActive,
    };
}
