// Sync engine: pushes the outbox (idempotent op_ids) then pulls remote changes.
import NetInfo from "@react-native-community/netinfo";
import { useSyncExternalStore } from "react";
import { AppState } from "react-native";

import { api, hasToken } from "@/src/lib/api";
import { nowISO } from "@/src/lib/format";
import { applyRemote, getState, inflight, isReady, replaceRecord, setMeta, setMutateHook, setOutbox, upsert, type Entity } from "./store";
import type { Conflict, OutboxOp } from "./types";

export type SyncStatus = "online" | "offline" | "pending" | "syncing" | "success" | "error";
type SyncState = { status: SyncStatus; online: boolean; error: string | null };

let ss: SyncState = { status: "online", online: true, error: null };
const listeners = new Set<() => void>();
const setSS = (p: Partial<SyncState>) => {
  ss = { ...ss, ...p };
  listeners.forEach((l) => l());
};
export const useSync = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => ss,
    () => ss,
  );

let running = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let debounce: ReturnType<typeof setTimeout> | undefined;
let retries = 0;
let businessPush: (() => Promise<void>) | null = null;
export const setBusinessPusher = (fn: (() => Promise<void>) | null) => {
  businessPush = fn;
};

function idleStatus(): SyncStatus {
  if (!ss.online) return "offline";
  return getState().outbox.length ? "pending" : "success";
}

export async function syncNow(opts: { force?: boolean } = {}): Promise<{ ok: boolean; message: string }> {
  if (!isReady() || !hasToken()) return { ok: false, message: "Belum masuk" };
  if (!ss.online) {
    setSS({ status: "offline" });
    return { ok: false, message: "Sedang offline. Data aman tersimpan di perangkat dan akan disinkronkan nanti." };
  }
  if (running) return { ok: false, message: "Sinkronisasi sedang berjalan" };
  running = true;
  let rejectedCount = 0;
  setSS({ status: "syncing", error: null });
  try {
    if (getState().meta.businessPending && businessPush) await businessPush();
    // push in batches
    for (let guard = 0; guard < 50; guard++) {
      const batch = getState().outbox.filter((o) => !inflight.has(o.op_id)).slice(0, 200);
      if (!batch.length) break;
      batch.forEach((o) => inflight.add(o.op_id));
      try {
        const res = await api<{ applied: string[]; duplicates: string[]; conflicts: any[]; rejected: { op_id: string }[] }>("/sync/push", {
          method: "POST", body: { ops: batch.map(({ attempts: _a, ...o }) => o), force: !!opts.force }, timeoutMs: 30000,
        });
        const done = new Set([...res.applied, ...res.duplicates, ...res.rejected.map((r) => r.op_id)]);
        const newConflicts: Conflict[] = res.conflicts.map((c) => ({ op: batch.find((o) => o.op_id === c.op_id)!, server: c.server, server_updated_at: c.server_updated_at }));
        newConflicts.forEach((c) => done.add(c.op.op_id));
        setOutbox(getState().outbox.filter((o) => !done.has(o.op_id)));
        if (newConflicts.length) setMeta({ conflicts: [...getState().meta.conflicts, ...newConflicts] });
        rejectedCount += res.rejected.length;
      } finally {
        batch.forEach((o) => inflight.delete(o.op_id));
      }
    }
    const pull = await api<{ records: any[]; server_time: string }>(`/sync/pull${getState().meta.lastPullAt ? `?since=${encodeURIComponent(getState().meta.lastPullAt!)}` : ""}`, { timeoutMs: 30000 });
    applyRemote(pull.records);
    setMeta({ lastPullAt: pull.server_time, lastSyncAt: nowISO() });
    retries = 0;
    if (rejectedCount) {
      const msg = `${rejectedCount} perubahan ditolak server (tidak diizinkan untuk akun ini) dan tidak disimpan di cloud.`;
      setSS({ status: "error", error: msg });
      setMeta({ lastRejected: msg } as any);
      return { ok: false, message: msg };
    }
    setSS({ status: idleStatus() });
    return { ok: true, message: "Sinkronisasi berhasil" };
  } catch (e: any) {
    setOutbox(getState().outbox.map((o) => ({ ...o, attempts: o.attempts + 1 })));
    setSS({ status: "error", error: e?.message ?? "Sinkronisasi gagal" });
    scheduleRetry();
    return { ok: false, message: e?.message ?? "Sinkronisasi gagal" };
  } finally {
    running = false;
  }
}

function scheduleRetry() {
  clearTimeout(retryTimer);
  const delay = [5000, 15000, 60000, 180000][Math.min(retries, 3)];
  retries += 1;
  retryTimer = setTimeout(() => ss.online && syncNow(), delay);
}

export function scheduleSync() {
  clearTimeout(debounce);
  if (!running) setSS({ status: idleStatus() });
  debounce = setTimeout(() => ss.online && syncNow(), 1500);
}

export function resolveConflict(c: Conflict, choice: "local" | "server") {
  const rest = getState().meta.conflicts.filter((x) => x.op.op_id !== c.op.op_id);
  setMeta({ conflicts: rest });
  if (choice === "server") {
    if (c.server) replaceRecord(c.op.entity as Entity, c.server);
  } else if (c.op.payload) {
    // re-apply local version on top of the server version (base = server version, so it is accepted)
    const op: OutboxOp = c.op;
    replaceRecord(op.entity as Entity, { ...op.payload, updated_at: c.server_updated_at });
    upsert(op.entity as Entity, { ...op.payload });
  }
}

let started = false;
export function startSyncEngine() {
  if (started) return;
  started = true;
  setMutateHook(scheduleSync);
  NetInfo.addEventListener((st) => {
    const online = st.isConnected !== false && st.isInternetReachable !== false;
    const wasOffline = !ss.online;
    setSS({ online, status: online ? (ss.status === "offline" ? idleStatus() : ss.status) : "offline" });
    if (online && wasOffline) syncNow();
  });
  AppState.addEventListener("change", (s) => {
    if ((s === "active" || s === "background") && ss.online) syncNow();
  });
}
