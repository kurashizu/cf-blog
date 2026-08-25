/**
 * localStorage persistence for KurAgent sessions and messages.
 *
 * Keys are versioned via the `agent_sessions` / `agent_messages:*` prefix.
 * If you change the on-disk format, bump the prefix and write a one-time
 * migration in `loadSessions`.
 */
import type { Message, SessionMeta } from "./types";

const SESSIONS_KEY = "agent_sessions";
const ACTIVE_KEY = "agent_active_session";
const MAX_SESSIONS = 10;

export function loadSessions(): SessionMeta[] {
    try {
        const raw = localStorage.getItem(SESSIONS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as SessionMeta[]) : [];
    } catch {
        return [];
    }
}

export function saveSessions(sessions: SessionMeta[]): void {
    try {
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    } catch {
        // QuotaExceededError / private-mode write block — losing persistence
        // must not crash the agent panel mid-conversation.
    }
}

export function loadMessages(sessionId: string): Message[] {
    try {
        const raw = localStorage.getItem(`agent_messages:${sessionId}`);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as Message[]) : [];
    } catch {
        return [];
    }
}

export function saveMessages(sessionId: string, messages: Message[]): void {
    try {
        localStorage.setItem(
            `agent_messages:${sessionId}`,
            JSON.stringify(messages),
        );
    } catch {
        // See saveSessions — never throw from the persistence layer.
    }
}

export function deleteStoredMessages(sessionId: string): void {
    try {
        localStorage.removeItem(`agent_messages:${sessionId}`);
    } catch {
        /* ignore */
    }
}

export function getActiveSessionId(): string {
    try {
        return localStorage.getItem(ACTIVE_KEY) ?? "";
    } catch {
        return "";
    }
}

export function setActiveSessionId(id: string): void {
    try {
        localStorage.setItem(ACTIVE_KEY, id);
    } catch {
        /* ignore */
    }
}

export { MAX_SESSIONS };
