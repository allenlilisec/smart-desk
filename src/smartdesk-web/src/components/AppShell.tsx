"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { api } from "@/lib/api";
import { navItemsForRoles } from "@/lib/navigation";

interface AppShellProps {
  title: string;
  children: React.ReactNode;
  nav?: React.ReactNode;
}

export function AppShell({ title, children, nav }: AppShellProps) {
  const { me, logout } = useAuth();
  const pathname = usePathname();
  const navItems = navItemsForRoles(me?.roles ?? []);

  return (
    <div className="min-h-screen bg-workspace text-slate-900 lg:flex">
      <aside className="hidden w-64 shrink-0 border-r border-slate-800 bg-slate-950 text-white lg:block">
        <div className="flex h-16 items-center gap-3 border-b border-slate-800 px-5">
          <Link href="/" className="flex items-center gap-3 font-semibold">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-action text-sm text-white">
              SD
            </span>
            <span>SmartDesk</span>
          </Link>
        </div>
        <nav className="space-y-1 px-3 py-4" aria-label="主导航">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-md px-3 py-2.5 transition ${
                  active ? "bg-white text-slate-950" : "text-slate-300 hover:bg-slate-900"
                }`}
              >
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className={`text-xs ${active ? "text-slate-600" : "text-slate-500"}`}>
                  {item.description}
                </span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
          <div className="flex min-h-16 items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div className="min-w-0">
              <Link href="/" className="mb-1 flex items-center gap-2 font-semibold text-brand-700 lg:hidden">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-action text-sm text-white">
                  SD
                </span>
                <span>SmartDesk</span>
              </Link>
              <h1 className="truncate text-base font-semibold text-slate-900">{title}</h1>
            </div>
            <div className="flex shrink-0 items-center gap-3">
            {api.isMock && (
              <span className="rounded-sm border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
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
                  className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  登出
                </button>
              </div>
            )}
            </div>
          </div>
          <nav className="flex gap-2 overflow-x-auto border-t border-line px-4 py-2 lg:hidden" aria-label="主导航">
            {navItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium ${
                    active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
