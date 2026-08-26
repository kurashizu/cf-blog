"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface QueryState<T> {
    data: T | null;
    error: string | null;
    loading: boolean;
    /** True only for the very first load — lets the UI keep stale rows visible. */
    initialLoading: boolean;
    refetch: () => void;
}

/**
 * Fetch JSON for an admin view, with the error handling the old pages
 * lacked: `res.ok` is checked, a failure sets `error` instead of writing an
 * error-shaped object into `data` (which used to crash the render on
 * `data.rows.length`), and an in-flight request is aborted when the query
 * changes or the component unmounts.
 *
 * `url` must be memoised by the caller (build it in a useMemo) — it is the
 * effect's dependency.
 */
export function useAdminQuery<T>(url: string): QueryState<T> {
    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [nonce, setNonce] = useState(0);
    const seenData = useRef(false);

    const refetch = useCallback(() => setNonce((n) => n + 1), []);

    useEffect(() => {
        const ctrl = new AbortController();
        let cancelled = false;
        setLoading(true);

        fetch(url, { signal: ctrl.signal })
            .then(async (res) => {
                const body = (await res.json().catch(() => null)) as
                    | (T & { error?: string })
                    | null;
                if (!res.ok || !body) {
                    throw new Error(
                        body?.error ?? `Request failed (${res.status})`,
                    );
                }
                return body as T;
            })
            .then((body) => {
                if (cancelled) return;
                seenData.current = true;
                setData(body);
                setError(null);
            })
            .catch((e: unknown) => {
                if (cancelled || (e as Error)?.name === "AbortError") return;
                setError(e instanceof Error ? e.message : String(e));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
            ctrl.abort();
        };
    }, [url, nonce]);

    return {
        data,
        error,
        loading,
        initialLoading: loading && !seenData.current,
        refetch,
    };
}
