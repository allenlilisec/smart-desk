"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { TicketList } from "@/components/TicketList";
import { TicketSearch } from "@/components/TicketSearch";
import { LoadingSpinner, EmptyState, SegmentedTabs, FloatingActionLink } from "@/components/ui";
import { api } from "@/lib/api";
import { filterTicketsByQuery } from "@/lib/ticketFilters";
import type { Ticket } from "@/lib/types";

const STATUS_TABS = [
  { key: "", label: "全部" },
  { key: "new", label: "新建" },
  { key: "in_progress", label: "处理中" },
  { key: "pending_user", label: "待我确认" },
  { key: "resolved", label: "已解决" },
  { key: "closed", label: "已关闭" },
];

const RESPONSE_SLA = {
  P1: "30 分钟内响应",
  P2: "2 小时内响应",
  P3: "4 小时内响应",
  P4: "8 小时内响应",
};

const FAQ_ITEMS = [
  { q: "如何提交工单？", a: "点击「提交工单」按钮，填写标题、描述和优先级即可。" },
  { q: "工单状态代表什么？", a: "新建→处理中→已解决→已关闭是标准流程，您可在「待我确认」阶段关闭工单。" },
  { q: "如何修改已提交的工单？", a: "工单提交后如需修改，请添加评论说明或在关闭后重新打开。" },
  { q: "紧急问题如何处理？", a: "选择 P1 紧急优先级，系统会优先分配给值班坐席。" },
];

export default function PortalPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

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

  const filteredTickets = useMemo(
    () => filterTicketsByQuery(tickets, searchQuery),
    [tickets, searchQuery]
  );
  const hasSearchQuery = searchQuery.trim().length > 0;

  const handleTabChange = (key: string) => {
    setStatusFilter(key);
    setSearchQuery("");
  };

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
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="mb-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
              <SegmentedTabs
                tabs={STATUS_TABS}
                activeKey={statusFilter}
                onChange={handleTabChange}
                ariaLabel="我的工单状态筛选"
              />
            </div>

            <div className="mb-4">
              <TicketSearch
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="按工单标题或编号搜索"
              />
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              {loading ? (
                <LoadingSpinner />
              ) : filteredTickets.length === 0 ? (
                <EmptyState
                  title={
                    hasSearchQuery
                      ? "没有找到匹配工单"
                      : statusFilter
                        ? "没有符合条件的工单"
                        : "还没有工单"
                  }
                  description={
                    hasSearchQuery
                      ? "换一个关键词，或清除搜索条件查看当前筛选下的全部工单。"
                      : statusFilter
                        ? "当前筛选下暂无记录，可切回全部状态查看完整列表。"
                        : "提交问题后，处理进度、评论和状态变化都会集中显示在这里。"
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
                    ) : (
                      <Link
                        href="/portal/new"
                        className="inline-flex rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                      >
                        提交工单
                      </Link>
                    )
                  }
                />
              ) : (
                <TicketList tickets={filteredTickets} linkPrefix="/portal" />
              )}
            </div>
          </div>

          <aside className="space-y-6 lg:col-span-1">
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">响应 SLA</h2>
              <p className="mt-1 text-xs text-slate-500">按优先级划分的响应时间承诺</p>
              <dl className="mt-4 space-y-2">
                {Object.entries(RESPONSE_SLA).map(([priority, sla]) => (
                  <div key={priority} className="flex items-center justify-between">
                    <dt className="text-xs font-medium text-slate-600">{priority}</dt>
                    <dd className="text-xs text-slate-700">{sla}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">常见问题</h2>
              <ul className="mt-4 space-y-4">
                {FAQ_ITEMS.map((item) => (
                  <li key={item.q} className="text-xs">
                    <p className="font-medium text-slate-700">Q: {item.q}</p>
                    <p className="mt-1 text-slate-500">A: {item.a}</p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">最近工单</h2>
              <p className="mt-1 text-xs text-slate-500">显示您最近查看的工单（待接入）</p>
              <div className="mt-4 rounded-md bg-slate-50 p-3 text-center">
                <p className="text-xs text-slate-400">功能占位 - 待 requester 历史能力接入</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
      <FloatingActionLink href="/portal/new" label="提交工单" />
    </AppShell>
  );
}
