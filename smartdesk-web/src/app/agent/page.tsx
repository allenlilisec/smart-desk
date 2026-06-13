"use client";

import { useEffect, useState, useCallback } from "react";
import { AppShell } from "@/components/AppShell";
import { TicketList } from "@/components/TicketList";
import { TicketDetailPanel } from "@/components/TicketDetailPanel";
import { LoadingSpinner, EmptyState } from "@/components/ui";
import { api } from "@/lib/api";
import type { Ticket, TicketAggregate } from "@/lib/types";

const QUEUE_TABS = [
  { key: "", label: "全部" },
  { key: "new", label: "待受理" },
  { key: "accepted", label: "已受理" },
  { key: "in_progress", label: "处理中" },
  { key: "pending_user", label: "待用户" },
  { key: "resolved", label: "已解决" },
];

export default function AgentWorkspacePage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ticket, setTicket] = useState<TicketAggregate | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const page = await api.listTickets(statusFilter ? { status: statusFilter } : undefined);
      setTickets(page.items);
      if (page.items.length > 0 && !selectedId) {
        setSelectedId(page.items[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter, selectedId]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const t = await api.getTicket(id);
      setTicket(t);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const handleUpdated = () => {
    loadQueue();
    if (selectedId) loadDetail(selectedId);
  };

  return (
    <AppShell title="坐席工作台">
      <div className="mx-auto flex h-[calc(100vh-57px)] max-w-7xl flex-col lg:flex-row">
        <aside className="w-full border-b border-slate-200 bg-white lg:w-80 lg:border-b-0 lg:border-r">
          <div className="flex gap-1 overflow-x-auto border-b border-slate-100 px-2 py-2">
            {QUEUE_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setStatusFilter(tab.key);
                  setSelectedId(null);
                }}
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${
                  statusFilter === tab.key
                    ? "bg-brand-500 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {loading ? (
            <LoadingSpinner />
          ) : tickets.length === 0 ? (
            <EmptyState title="队列为空" />
          ) : (
            <TicketList
              tickets={tickets}
              selectedId={selectedId || undefined}
              onSelect={setSelectedId}
            />
          )}
        </aside>

        <section className="flex-1 overflow-hidden bg-slate-50">
          {!selectedId ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              选择左侧工单查看详情
            </div>
          ) : detailLoading || !ticket ? (
            <LoadingSpinner />
          ) : (
            <TicketDetailPanel ticket={ticket} mode="agent" onUpdated={handleUpdated} />
          )}
        </section>
      </div>
    </AppShell>
  );
}
