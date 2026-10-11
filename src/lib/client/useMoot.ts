"use client";
import { useCallback, useEffect, useState } from "react";
import type { MootState } from "@/lib/state";

export type { MootState };
export type BillView = NonNullable<MootState["bill"]>;
export type MemberView = MootState["members"][number];
export type LawView = MootState["laws"][number];

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  } catch {
    return "America/New_York";
  }
}

export async function postJson<T>(url: string, body: unknown, method = "POST"): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("The network is unreachable. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `The server answered ${res.status}. Try again.`);
  return data as T;
}

type Status = "loading" | "none" | "ready" | "error";

export function useMoot() {
  const [state, setState] = useState<MootState | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (res.status === 404) {
        setState(null);
        setStatus("none");
        return null;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "The House records could not be loaded.");
      setState(data);
      setStatus("ready");
      setError(null);
      return data as MootState;
    } catch (err) {
      setError(err instanceof Error && err.message !== "Failed to fetch" ? err.message : "The network is unreachable. Check your connection and try again.");
      setStatus((s) => (s === "ready" ? s : "error"));
      return null;
    }
  }, []);

  useEffect(() => {
    // Fetching on mount is the point of this hook.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const startDemo = useCallback(async () => {
    await postJson("/api/session", { timezone: browserTimeZone() });
    return refresh();
  }, [refresh]);

  return { state, status, error, refresh, startDemo, setError };
}

const SPEAKER_KEY = "moot.speakingAs";

export function rememberSpeaker(id: string) {
  try {
    localStorage.setItem(SPEAKER_KEY, id);
  } catch {
    // Storage can be unavailable (private mode); the choice simply is not remembered.
  }
}

export function recallSpeaker(): string | null {
  try {
    return localStorage.getItem(SPEAKER_KEY);
  } catch {
    return null;
  }
}
