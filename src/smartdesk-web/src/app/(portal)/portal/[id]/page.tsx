"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { TicketDetailPanel } from "@/components/TicketDetailPanel";
import { LoadingSpinner } from "@/components/ui";
import { api } from "@/lib/api";
import type { TicketAggregate } from "@/lib/types";

export default function PortalTicketDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [ticket, setTicket] = useState<TicketAggregate | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const t = await api.getTicket(id);
      setTicket(t);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AppShell title="工单详情">
      <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6">
        <Link href="/portal" className="text-sm text-brand-600 hover:underline">
          ← 返回我的工单
        </Link>
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {loading || !ticket ? (
            <LoadingSpinner />
          ) : (
            <TicketDetailPanel ticket={ticket} mode="requester" onUpdated={load} />
          )}
        </div>
      </div>
    </AppShell>
  );
}
