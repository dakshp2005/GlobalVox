"use client";

// Offline-first result storage: every finished call is saved on the device first
// and pushed to the server whenever a connection is available.

export interface QueuedResult {
  id: string;
  inviteeId: string;
  body: {
    outcome: string;
    summary: string;
    transcript: { role: "agent" | "user"; content: string }[];
    durationSeconds: number;
    endedAt: string;
  };
}

const KEY = "gv-offline-queue-v1";
const SIM_KEY = "gv-simulate-offline";
const EVENT = "gv-queue-changed";

function read(): QueuedResult[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as QueuedResult[];
  } catch {
    return [];
  }
}

function write(items: QueuedResult[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // storage full or blocked: nothing more we can do
  }
  window.dispatchEvent(new Event(EVENT));
}

export function enqueue(item: Omit<QueuedResult, "id">) {
  write([...read(), { ...item, id: crypto.randomUUID() }]);
}

export const pendingCount = () => read().length;

/** Demo switch: pretend there is no internet so results stay queued. */
export function isSimulatedOffline() {
  try {
    return localStorage.getItem(SIM_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSimulatedOffline(on: boolean) {
  try {
    localStorage.setItem(SIM_KEY, on ? "1" : "0");
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(EVENT));
}

/** For useSyncExternalStore: re-render when the queue, the demo switch or connectivity changes. */
export function subscribeQueue(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export const isOnline = () => navigator.onLine && !isSimulatedOffline();

let syncing = false;

/** Sends queued results one by one; stops at the first network/server problem and keeps the rest. */
export async function syncQueue(): Promise<{ synced: number; remaining: number }> {
  if (syncing || !isOnline()) return { synced: 0, remaining: pendingCount() };
  syncing = true;
  let synced = 0;
  try {
    for (const item of read()) {
      let res: Response;
      try {
        res = await fetch(`/api/invitees/${item.inviteeId}/offline-result`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.body),
        });
      } catch {
        break; // no connection: try again later
      }
      if (res.ok || res.status === 400 || res.status === 404) {
        // Delivered, or permanently rejected (e.g. the invitee was deleted): don't retry forever.
        write(read().filter((q) => q.id !== item.id));
        if (res.ok) synced++;
      } else {
        break; // 401 / 5xx: keep it and retry later
      }
    }
  } finally {
    syncing = false;
  }
  return { synced, remaining: pendingCount() };
}
