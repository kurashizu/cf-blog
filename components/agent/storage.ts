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
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
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
    localStorage.setItem(
        `agent_messages:${sessionId}`,
        JSON.stringify(messages),
    );
}

export function deleteStoredMessages(sessionId: string): void {
    localStorage.removeItem(`agent_messages:${sessionId}`);
}

export function getActiveSessionId(): string {
    return localStorage.getItem(ACTIVE_KEY) ?? "";
}

export function setActiveSessionId(id: string): void {
    localStorage.setItem(ACTIVE_KEY, id);
}

export { MAX_SESSIONS };
