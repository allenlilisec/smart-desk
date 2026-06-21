"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { TicketList } from "@/components/TicketList";
import { AgentContextPanel } from "@/components/AgentContextPanel";
import { TicketDetailPanel } from "@/components/TicketDetailPanel";
import { TicketSearch } from "@/components/TicketSearch";
import { LoadingSpinner, EmptyState } from "@/components/ui";
import { api } from "@/lib/api";
import { filterTicketsByQuery } from "@/lib/ticketFilters";
import type { Ticket, TicketAggregate, TicketStatus } from "@/lib/types";

type QueueView = {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly status?: TicketStatus;
};

const QUEUE_VIEWS: readonly QueueView[] = [
  { key: "all", label: "全部", description: "网关授权范围" },
  { key: "new", label: "待受理", description: "status=new", status: "new" },
  { key: "in_progress", label: "处理中", description: "status=in_progress", status: "in_progress" },
  { key: "pending_user", label: "待用户", description: "status=pending_user", status: "pending_user" },
];

export default function AgentWorkspacePage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ticket, setTicket] = useState<TicketAggregate | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [queueView, setQueueView] = useState<QueueView>(QUEUE_VIEWS[0]);
  const [searchQuery, setSearchQuery] = useState("");

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const page = await api.listTickets(queueView.status ? { status: queueView.status } : undefined);
      setTickets(page.items);
      setSelectedId((current) => current ?? page.items[0]?.id ?? null);
    } finally {
      setLoading(false);
    }
  }, [queueView]);

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

  const visibleTickets = useMemo(
    () => filterTicketsByQuery(tickets, searchQuery),
    [tickets, searchQuery]
  );
  const hasSearchQuery = searchQuery.trim().length > 0;

  useEffect(() => {
    if (loading) {
      return;
    }

    const selectedTicketIsVisible = visibleTickets.some((item) => item.id === selectedId);
    if (selectedTicketIsVisible) {
      return;
    }

    const nextSelectedId = visibleTickets[0]?.id ?? null;
    setSelectedId(nextSelectedId);
    if (!nextSelectedId) {
      setTicket(null);
    }
  }, [loading, selectedId, visibleTickets]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const handleUpdated = () => {
    loadQueue();
    if (selectedId) loadDetail(selectedId);
  };

  return (
    <AppShell title="坐席工作台">
      <div className="flex h-[calc(100vh-65px)] min-w-0 flex-col overflow-hidden lg:flex-row">
        <aside className="w-full shrink-0 border-b border-line bg-white lg:w-80 lg:border-b-0 lg:border-r">
          <div className="border-b border-line px-4 py-4">
            <p className="text-xs font-semibold uppercase text-slate-500">Queue</p>
            <h2 className="mt-1 text-sm font-semibold text-slate-900">队列视图</h2>
          </div>
          <div className="grid grid-cols-2 gap-2 border-b border-line p-3 lg:grid-cols-1">
            {QUEUE_VIEWS.map((view) => (
              <button
                key={view.key}
                type="button"
                onClick={() => {
                  setQueueView(view);
                  setSearchQuery("");
                  setSelectedId(null);
                }}
                className={`rounded-md border px-3 py-2 text-left transition ${
                  queueView.key === view.key
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-line bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className="block text-sm font-semibold">{view.label}</span>
                <span
                  className={`mt-0.5 block text-xs ${
                    queueView.key === view.key ? "text-brand-700" : "text-slate-500"
                  }`}
                >
                  {view.description}
                </span>
              </button>
            ))}
          </div>
          <div className="border-b border-line p-3">
            <TicketSearch
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="按标题或编号定位工单"
            />
          </div>
          <div className="h-[360px] overflow-auto lg:h-[calc(100vh-317px)]">
            {loading ? (
              <LoadingSpinner />
            ) : visibleTickets.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title={hasSearchQuery ? "没有找到匹配工单" : "队列为空"}
                  description={
                    hasSearchQuery
                      ? "清除搜索后可继续处理当前视图下的其他工单。"
                      : "当前视图下没有可处理工单。"
                  }
                  action={
                    hasSearchQuery ? (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="inline-flex rounded-md border border-brand-200 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
                      >
                        清除搜索
                      </button>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <TicketList
                tickets={visibleTickets}
                selectedId={selectedId || undefined}
                onSelect={setSelectedId}
              />
            )}
          </div>
        </aside>

        <section className="min-w-0 flex-1 overflow-hidden bg-workspace">
          {!selectedId ? (
            <div className="flex h-full items-center justify-center p-6">
              <EmptyState
                title="选择一张工单查看详情"
                description="详情区会展示问题描述、处理动作、评论和时间线。"
              />
            </div>
          ) : detailLoading || !ticket ? (
            <LoadingSpinner />
          ) : (
            <TicketDetailPanel ticket={ticket} mode="agent" onUpdated={handleUpdated} />
          )}
        </section>

        <AgentContextPanel />
      </div>
    </AppShell>
  );
}
