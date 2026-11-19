import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { api, ApiError, CLOUD_ENABLED, setApiToken } from "@/src/lib/api";
import { uuid } from "@/src/lib/format";
import { storage } from "@/src/utils/storage";
import { getState, loadDB, setMeta, setSyncQueueEnabled, unloadDB } from "@/src/data/store";
import { setBusinessPusher, startSyncEngine, syncNow } from "@/src/data/sync";
import type { Business, User } from "@/src/data/types";
import { setActor } from "@/src/data/actions";

const TOKEN_KEY = "usahora_token";
const SESSION_KEY = "usahora_session";
// The local workspace (no account) of this device. Kept after "Keluar" so starting again reopens the
// same data instead of creating a new, empty business (the old data would otherwise be orphaned).
const LOCAL_WORKSPACE_KEY = "usahora_local_workspace";

export type LocalWorkspace = { user: User; business: Business };
export async function getLocalWorkspace(): Promise<LocalWorkspace | null> {
  const raw = await storage.getItem(LOCAL_WORKSPACE_KEY, null as string | null);
  try {
    return raw ? (JSON.parse(raw) as LocalWorkspace) : null;
  } catch {
    return null;
  }
}

type AuthState = {
  status: "loading" | "out" | "in";
  user: User | null;
  business: Business | null;
  login: (email: string, password: string) => Promise<void>;
  register: (p: { name: string; business_name: string; email: string; password: string }) => Promise<void>;
  /** Start (or reopen) the local workspace on this device. No account, no server. */
  startLocal: (p?: { name: string; business_name: string }) => Promise<void>;
  /** True when using the local workspace (data only on this device). */
  isLocal: boolean;
  logout: () => Promise<void>;
  updateBusiness: (b: Business) => Promise<"online" | "local">;
  isOwner: boolean;
};

const Ctx = createContext<AuthState | null>(null);
export const useAuth = () => useContext(Ctx)!;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState["status"]>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [isLocal, setIsLocal] = useState(false);

  const saveSession = (u: User, b: Business, local = false) => storage.setItem(SESSION_KEY, JSON.stringify({ user: u, business: b, local }));

  const enter = useCallback(async (token: string | null, u: User, b: Business) => {
    setApiToken(token);
    setSyncQueueEnabled(!!token);
    setIsLocal(!token);
    await loadDB(u.business_id, u.role === "cashier" ? `_${u.id}` : "");
    setActor(u.name);
    setUser(u);
    setBusiness(b);
    setStatus("in");
    startSyncEngine();
    setBusinessPusher(async () => {
      const raw = await storage.getItem(SESSION_KEY, null as string | null);
      const sb = raw ? JSON.parse(raw).business : null;
      if (sb) await api("/business", { method: "PUT", body: sb });
      setMeta({ businessPending: false });
    });
    syncNow();
  }, []);

  const logout = useCallback(async () => {
    await storage.secureRemove(TOKEN_KEY);
    await storage.removeItem(SESSION_KEY);
    setApiToken(null);
    setBusinessPusher(null);
    unloadDB();
    setUser(null);
    setBusiness(null);
    setIsLocal(false);
    setStatus("out");
  }, []);

  useEffect(() => {
    (async () => {
      const token = await storage.secureGet(TOKEN_KEY, null as string | null);
      const raw = await storage.getItem(SESSION_KEY, null as string | null);
      let parsed: { user: User; business: Business; local?: boolean } | null = null;
      try {
        parsed = raw ? JSON.parse(raw) : null;
      } catch {
        parsed = null;
      }
      if (parsed?.local) return enter(null, parsed.user, parsed.business); // local workspace, fully offline
      if (!token || !parsed || !CLOUD_ENABLED) return setStatus("out");
      const sess = parsed;
      await enter(token, sess.user, sess.business); // works offline from the cached session
      try {
        const me = await api<{ user: User; business: Business }>("/auth/me");
        if (!getState().meta.businessPending) {
          setBusiness(me.business);
          setUser(me.user);
          saveSession(me.user, me.business);
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) logout();
      }
    })();
  }, [enter, logout]);

  const handleAuth = async (res: { access_token: string; user: User; business: Business }) => {
    await storage.secureSet(TOKEN_KEY, res.access_token);
    await saveSession(res.user, res.business);
    await enter(res.access_token, res.user, res.business);
  };

  const login = async (email: string, password: string) => {
    await handleAuth(await api("/auth/login", { method: "POST", body: { email: email.trim(), password } }));
  };
  const register = async (p: { name: string; business_name: string; email: string; password: string }) => {
    await handleAuth(await api("/auth/register", { method: "POST", body: { ...p, email: p.email.trim() } }));
  };

  const startLocal = async (p?: { name: string; business_name: string }) => {
    let ws = await getLocalWorkspace();
    if (!ws) {
      if (!p) throw new Error("Isi nama usaha terlebih dahulu");
      const businessId = `local-${uuid()}`;
      ws = {
        user: { id: `local-${uuid()}`, name: p.name.trim() || "Pemilik", email: "", business_id: businessId, role: "owner" },
        business: { id: businessId, name: p.business_name.trim(), address: "", phone: "", email: "", currency: "IDR", invoice_footer: "Terima kasih atas kepercayaan Anda.", tax_enabled: false, tax_rate: 11, bank_info: "", logo_file_id: null },
      };
      if (!(await storage.setItem(LOCAL_WORKSPACE_KEY, JSON.stringify(ws)))) throw new Error("Penyimpanan browser tidak dapat dipakai. Coba buka di mode biasa (bukan mode penyamaran).");
    }
    await saveSession(ws.user, ws.business, true);
    await enter(null, ws.user, ws.business);
  };

  const updateBusiness = async (b: Business) => {
    setBusiness(b);
    if (isLocal && user) {
      await saveSession(user, b, true);
      await storage.setItem(LOCAL_WORKSPACE_KEY, JSON.stringify({ user, business: b }));
      return "local" as const;
    }
    if (user) await saveSession(user, b);
    try {
      const saved = await api<Business>("/business", { method: "PUT", body: b });
      setBusiness(saved);
      if (user) await saveSession(user, saved);
      return "online" as const;
    } catch {
      setMeta({ businessPending: true });
      return "local" as const;
    }
  };

  return <Ctx.Provider value={{ status, user, business, login, register, startLocal, isLocal, logout, updateBusiness, isOwner: (user?.role ?? "owner") === "owner" }}>{children}</Ctx.Provider>;
}
