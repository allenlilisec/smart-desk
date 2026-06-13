"use client";

import Link from "next/link";
import type { Ticket } from "@/lib/types";
import { StatusBadge, PriorityBadge } from "./ui";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface TicketListProps {
  tickets: Ticket[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  linkPrefix?: string;
}

export function TicketList({ tickets, selectedId, onSelect, linkPrefix }: TicketListProps) {
  if (tickets.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-slate-500">暂无工单</p>;
  }

  return (
    <ul className="divide-y divide-slate-100">
      {tickets.map((ticket) => {
        const isSelected = selectedId === ticket.id;
        const content = (
          <>
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono text-xs text-slate-400">{ticket.number}</span>
              <StatusBadge status={ticket.status} />
            </div>
            <p className="mt-1 line-clamp-2 font-medium text-slate-800">{ticket.title}</p>
            <div className="mt-2 flex items-center gap-2">
              <PriorityBadge priority={ticket.priority} />
              <span className="text-xs text-slate-400">{formatDate(ticket.created_at)}</span>
            </div>
          </>
        );

        if (linkPrefix) {
          return (
            <li key={ticket.id}>
              <Link
                href={`${linkPrefix}/${ticket.id}`}
                className={`block px-4 py-3 transition hover:bg-slate-50 ${isSelected ? "border-l-2 border-brand-500 bg-brand-50/50" : ""}`}
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
              className={`w-full px-4 py-3 text-left transition hover:bg-slate-50 ${isSelected ? "border-l-2 border-brand-500 bg-brand-50/50" : ""}`}
            >
              {content}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
