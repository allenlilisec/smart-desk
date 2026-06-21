"use client";

import Link from "next/link";
import type { Ticket } from "@/lib/types";
import { EmptyState, StatusBadge, PriorityBadge } from "./ui";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface TicketListProps {
  readonly tickets: readonly Ticket[];
  readonly selectedId?: string;
  readonly onSelect?: (id: string) => void;
  readonly linkPrefix?: string;
}

export function TicketList({ tickets, selectedId, onSelect, linkPrefix }: TicketListProps) {
  if (tickets.length === 0) {
    return (
      <EmptyState
        title="没有工单"
        description="调整筛选条件或提交新的服务请求后，工单会显示在这里。"
      />
    );
  }

  return (
    <ul className="divide-y divide-slate-100">
      {tickets.map((ticket) => {
        const isSelected = selectedId === ticket.id;
        const content = (
          <div className="flex gap-3">
            <span
              aria-hidden="true"
              className={`mt-1 h-12 w-1 shrink-0 rounded-sm ${
                ticket.priority === "P1" ? "bg-red-500" : "bg-brand-500"
              }`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-xs text-slate-500">{ticket.number}</span>
                <StatusBadge status={ticket.status} />
              </div>
              <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-900">
                {ticket.title}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <PriorityBadge priority={ticket.priority} />
                <span className="text-xs text-slate-500">{formatDate(ticket.created_at)}</span>
              </div>
            </div>
          </div>
        );

        if (linkPrefix) {
          return (
            <li key={ticket.id}>
              <Link
                href={`${linkPrefix}/${ticket.id}`}
                className={`block px-4 py-3 transition hover:bg-slate-50 ${
                  isSelected ? "bg-brand-50" : ""
                }`}
              >
                {content}
              </Link>
            </li>
          );
        }

        return (
          <li key={ticket.id}>
            <button
              type="button"
              onClick={() => onSelect?.(ticket.id)}
              className={`w-full px-4 py-3 text-left transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500 ${
                isSelected ? "bg-brand-50" : ""
              }`}
            >
              {content}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
