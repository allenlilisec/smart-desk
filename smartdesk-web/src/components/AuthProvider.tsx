"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { api } from "@/lib/api";
import {
  clearSession,
  getAccessToken,
  getStoredMe,
  homePathForRoles,
  saveSession,
} from "@/lib/auth";
import type { Me } from "@/lib/types";

interface AuthContextValue {
  me: Me | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PUBLIC_PATHS = ["/login"];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const refreshMe = useCallback(async () => {
    try {
      const user = await api.getMe();
      setMe(user);
      localStorage.setItem("sd_me", JSON.stringify(user));
    } catch {
      setMe(null);
      clearSession();
    }
  }, []);

  useEffect(() => {
    const token = getAccessToken();
    const stored = getStoredMe();
    if (!token) {
      setLoading(false);
      if (!PUBLIC_PATHS.includes(pathname)) router.replace("/login");
      return;
    }
    if (stored) setMe(stored);
    refreshMe().finally(() => setLoading(false));
  }, [pathname, refreshMe, router]);

  useEffect(() => {
    if (loading) return;
    if (!me && !PUBLIC_PATHS.includes(pathname)) {
      router.replace("/login");
    }
  }, [me, loading, pathname, router]);

  const login = async (username: string, password: string) => {
    const { tokens, me: user } = await api.login(username, password);
    saveSession(tokens, user);
    setMe(user);
    router.replace(homePathForRoles(user.roles));
  };

  const logout = async () => {
    await api.logout();
    clearSession();
    setMe(null);
    router.replace("/login");
  };

  return (
    <AuthContext.Provider value={{ me, loading, login, logout, refreshMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
