import type { TicketStatus, Priority } from "@/lib/types";
import { STATUS_LABELS, STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS } from "@/lib/types";
import Link from "next/link";
import type { ReactNode } from "react";

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={`inline-flex rounded-sm border px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`inline-flex rounded-sm border px-2 py-0.5 text-xs font-medium ${PRIORITY_COLORS[priority]}`}>
      {priority} · {PRIORITY_LABELS[priority]}
    </span>
  );
}

interface EmptyStateProps {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-lg border border-dashed border-line bg-surface px-6 py-12 text-center">
      <div className="relative mb-5 h-24 w-28" aria-hidden="true">
        <div className="absolute left-4 top-4 h-16 w-20 rounded-lg border border-brand-200 bg-brand-50 shadow-sm" />
        <div className="absolute left-8 top-8 h-2 w-12 rounded-full bg-brand-200" />
        <div className="absolute left-8 top-14 h-2 w-8 rounded-full bg-emerald-200" />
        <div className="absolute right-3 top-1 flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-lg font-semibold text-white shadow-sm">
          +
        </div>
      </div>
      <p className="text-base font-semibold text-slate-800">{title}</p>
      {description && <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function InlineRetry({
  title,
  description,
}: {
  readonly title: string;
  readonly description?: string;
}) {
  return (
    <div className="rounded-md border border-dashed border-line bg-slate-50 px-3 py-3">
      <p className="text-xs font-semibold text-slate-700">{title}</p>
      {description && <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}
    </div>
  );
}

export function OfflineBanner() {
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-800">
      网络连接不可用，操作将在恢复后重试。
    </div>
  );
}

export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
    </div>
  );
}

interface TabItem {
  readonly key: string;
  readonly label: string;
}

interface SegmentedTabsProps {
  readonly tabs: readonly TabItem[];
  readonly activeKey: string;
  readonly onChange: (key: string) => void;
  readonly ariaLabel: string;
}

export function SegmentedTabs({ tabs, activeKey, onChange, ariaLabel }: SegmentedTabsProps) {
  return (
    <div className="max-w-full overflow-x-auto border-b border-slate-100 px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div role="tablist" aria-label={ariaLabel} className="flex min-w-max gap-2">
        {tabs.map((tab) => {
          const selected = activeKey === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(tab.key)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
                selected
                  ? "bg-brand-600 text-white shadow-sm"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-brand-50 hover:text-brand-700"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FloatingActionLink({ href, label }: { readonly href: string; readonly label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-900/20 transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-base leading-none" aria-hidden="true">
        +
      </span>
      <span>{label}</span>
    </Link>
  );
}
