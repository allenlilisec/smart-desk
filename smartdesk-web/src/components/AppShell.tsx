"use client";

import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { api } from "@/lib/api";

interface AppShellProps {
  title: string;
  children: React.ReactNode;
  nav?: React.ReactNode;
}

export function AppShell({ title, children, nav }: AppShellProps) {
  const { me, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2 font-semibold text-brand-700">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm text-white">
                SD
              </span>
              <span className="hidden sm:inline">SmartDesk</span>
            </Link>
            <h1 className="text-sm font-medium text-slate-600">{title}</h1>
          </div>
          <div className="flex items-center gap-3">
            {api.isMock && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                Mock 模式
              </span>
            )}
            {nav}
            {me && (
              <div className="flex items-center gap-3">
                <span className="hidden text-sm text-slate-600 sm:inline">
                  {me.display_name}
                </span>
                <button
                  onClick={() => logout()}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                >
                  登出
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
