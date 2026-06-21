"use client";

import { AppShell } from "@/components/AppShell";
import Link from "next/link";

// Metric card placeholder data
const METRIC_CARDS = [
  {
    key: "sla",
    title: "SLA 达成率",
    description: "按时响应和解决的工单占比",
    status: "placeholder" as const,
  },
  {
    key: "backlog",
    title: "积压工单",
    description: "待处理和超期的工单数量",
    status: "placeholder" as const,
  },
  {
    key: "workload",
    title: "坐席工作量",
    description: "各坐席的工单分配和处理统计",
    status: "placeholder" as const,
  },
  {
    key: "category",
    title: "分类分布",
    description: "按分类统计的工单分布",
    status: "placeholder" as const,
  },
  {
    key: "reopen",
    title: "重开率",
    description: "已关闭后重新打开的工单占比",
    status: "placeholder" as const,
  },
  {
    key: "csat",
    title: "CSAT 满意度",
    description: "客户满意度评分统计",
    status: "placeholder" as const,
  },
];

// Quick access links
const QUICK_LINKS = [
  { href: "/desk", label: "坐席工作台", description: "进入工单处理界面" },
  { href: "/admin", label: "管理后台", description: "系统配置和用户管理" },
];

export default function DashboardPage() {
  return (
    <AppShell title="数据看板">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Dashboard description */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-slate-900">数据看板入口</h2>
          <p className="mt-1 text-sm text-slate-500">
            统一壳层和入口骨架。/stats 图表渲染归 P1，不作为 06-18 必达。
          </p>
        </div>

        {/* Stats grid - placeholder cards */}
        <div className="mb-8">
          <h3 className="mb-4 text-sm font-medium text-slate-700">核心指标（P1 图表渲染）</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {METRIC_CARDS.map((metric) => (
              <div
                key={metric.key}
                className="overflow-hidden rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-slate-900">{metric.title}</h4>
                    <p className="mt-1 text-xs text-slate-500">{metric.description}</p>
                  </div>
                  <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 ring-1 ring-slate-200">
                    待接入
                  </span>
                </div>
                {/* Placeholder for chart area */}
                <div className="mt-4 h-32 rounded-md bg-slate-50 p-4">
                  <div className="flex h-full items-center justify-center">
                    <div className="text-center">
                      <div className="mx-auto mb-2 h-8 w-8 rounded-full bg-slate-200" />
                      <p className="text-xs text-slate-400">图表渲染区域</p>
                      <p className="text-xs text-slate-400">依赖 /stats API</p>
                    </div>
                  </div>
                </div>
                {/* Placeholder stat value */}
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-slate-300">--</span>
                  <span className="text-xs text-slate-400">待数据接入</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick access section */}
        <div className="mb-8">
          <h3 className="mb-4 text-sm font-medium text-slate-700">快速入口</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {QUICK_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:bg-brand-50"
              >
                <div>
                  <h4 className="font-medium text-slate-900">{link.label}</h4>
                  <p className="mt-0.5 text-xs text-slate-500">{link.description}</p>
                </div>
                <svg
                  className="h-5 w-5 text-slate-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </Link>
            ))}
          </div>
        </div>

        {/* CSV export placeholder */}
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-slate-900">数据导出</h3>
              <p className="mt-1 text-xs text-slate-500">导出统计数据为 CSV 格式（P1 功能）</p>
            </div>
            <button
              disabled
              className="rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-400 cursor-not-allowed"
              aria-disabled="true"
            >
              导出 CSV
            </button>
          </div>
          <div className="mt-4 rounded-md bg-slate-50 p-3">
            <p className="text-xs text-slate-400">
              功能占位 - 依赖 /stats/export API（P1）
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
