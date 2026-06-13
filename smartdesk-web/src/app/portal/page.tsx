"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { TicketList } from "@/components/TicketList";
import { LoadingSpinner, EmptyState } from "@/components/ui";
import { api } from "@/lib/api";
import type { Ticket } from "@/lib/types";

const STATUS_TABS = [
  { key: "", label: "全部" },
  { key: "new", label: "新建" },
  { key: "in_progress", label: "处理中" },
  { key: "pending_user", label: "待我确认" },
  { key: "resolved", label: "已解决" },
  { key: "closed", label: "已关闭" },
];

export default function PortalPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await api.listTickets(statusFilter ? { status: statusFilter } : undefined);
      setTickets(page.items);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const nav = (
    <Link
      href="/portal/new"
      className="rounded-md bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
    >
      提交工单
    </Link>
  );

  return (
    <AppShell title="报单门户" nav={nav}>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <div className="mb-4 flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`rounded-full px-3 py-1 text-sm ${
                statusFilter === tab.key
                  ? "bg-brand-500 text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <LoadingSpinner />
          ) : tickets.length === 0 ? (
            <EmptyState
              title="暂无工单"
              description="点击右上角「提交工单」发起第一个请求"
            />
          ) : (
            <TicketList tickets={tickets} linkPrefix="/portal" />
          )}
        </div>
      </div>
    </AppShell>
  );
}
