import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { api, ApiError, setApiToken } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";
import { getState, loadDB, setMeta, unloadDB } from "@/src/data/store";
import { setBusinessPusher, startSyncEngine, syncNow } from "@/src/data/sync";
import type { Business, User } from "@/src/data/types";

const TOKEN_KEY = "usahora_token";
const SESSION_KEY = "usahora_session";

type AuthState = {
  status: "loading" | "out" | "in";
  user: User | null;
  business: Business | null;
  login: (email: string, password: string) => Promise<void>;
  register: (p: { name: string; business_name: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  updateBusiness: (b: Business) => Promise<"online" | "local">;
};

const Ctx = createContext<AuthState | null>(null);
export const useAuth = () => useContext(Ctx)!;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState["status"]>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);

  const saveSession = (u: User, b: Business) => storage.setItem(SESSION_KEY, JSON.stringify({ user: u, business: b }));

  const enter = useCallback(async (token: string, u: User, b: Business) => {
    setApiToken(token);
    await loadDB(u.business_id);
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
    setStatus("out");
  }, []);

  useEffect(() => {
    (async () => {
      const token = await storage.secureGet(TOKEN_KEY, null as string | null);
      const raw = await storage.getItem(SESSION_KEY, null as string | null);
      if (!token || !raw) return setStatus("out");
      const sess = JSON.parse(raw) as { user: User; business: Business };
      await enter(token, sess.user, sess.business); // works offline from the cached session
      try {
        const me = await api<{ user: User; business: Business }>("/auth/me");
        if (!getState().meta.businessPending) {
          setBusiness(me.business);
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

  const updateBusiness = async (b: Business) => {
    setBusiness(b);
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

  return <Ctx.Provider value={{ status, user, business, login, register, logout, updateBusiness }}>{children}</Ctx.Provider>;
}
