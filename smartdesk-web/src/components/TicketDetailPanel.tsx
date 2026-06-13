"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import type { Comment, TicketAggregate, TimelineEntry, TransitionAction } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import { StatusBadge, PriorityBadge } from "./ui";

const AGENT_ACTIONS: { action: TransitionAction; label: string; statuses: string[] }[] = [
  { action: "accept", label: "受理", statuses: ["new"] },
  { action: "start", label: "开始处理", statuses: ["accepted"] },
  { action: "wait_user", label: "待用户", statuses: ["in_progress"] },
  { action: "resolve", label: "标记解决", statuses: ["in_progress", "pending_user"] },
  { action: "suspend", label: "挂起", statuses: ["in_progress"] },
  { action: "resume", label: "恢复", statuses: ["suspended"] },
];

const REQUESTER_ACTIONS: { action: TransitionAction; label: string; statuses: string[] }[] = [
  { action: "close", label: "确认关闭", statuses: ["resolved"] },
  { action: "reopen", label: "重开工单", statuses: ["resolved", "closed"] },
];

interface TicketDetailPanelProps {
  ticket: TicketAggregate;
  mode: "agent" | "requester";
  onUpdated: () => void;
}

export function TicketDetailPanel({ ticket, mode, onUpdated }: TicketDetailPanelProps) {
  const [comment, setComment] = useState("");
  const [visibility, setVisibility] = useState<"public" | "internal">("public");
  const [submitting, setSubmitting] = useState(false);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [tl, cm] = await Promise.all([
        api.getTimeline(ticket.id),
        api.listComments(ticket.id, mode === "agent"),
      ]);
      if (!cancelled) {
        setTimeline(tl.items);
        setComments(cm.items);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ticket.id, mode]);

  const actions = mode === "agent" ? AGENT_ACTIONS : REQUESTER_ACTIONS;
  const available = actions.filter((a) => a.statuses.includes(ticket.status));

  const handleTransition = async (action: TransitionAction) => {
    setSubmitting(true);
    try {
      await api.transition(ticket.id, action);
      onUpdated();
    } finally {
      setSubmitting(false);
    }
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    setSubmitting(true);
    try {
      await api.addComment(ticket.id, comment.trim(), visibility);
      setComment("");
      const [tl, cm] = await Promise.all([
        api.getTimeline(ticket.id),
        api.listComments(ticket.id, mode === "agent"),
      ]);
      setTimeline(tl.items);
      setComments(cm.items);
      onUpdated();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-slate-400">{ticket.number}</span>
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
        </div>
        <h2 className="mt-2 text-lg font-semibold text-slate-900">{ticket.title}</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
          {ticket.description}
        </p>
        {available.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {available.map((a) => (
              <button
                key={a.action}
                disabled={submitting}
                onClick={() => handleTransition(a.action)}
                className="rounded-md bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-auto p-4 sm:p-6 lg:flex-row">
        <section className="flex-1 space-y-4">
          <h3 className="text-sm font-semibold text-slate-700">评论</h3>
          <div className="space-y-3">
            {comments.length === 0 ? (
              <p className="text-sm text-slate-400">暂无评论</p>
            ) : (
              comments.map((c) => (
                <div
                  key={c.id}
                  className={`rounded-lg border p-3 ${c.visibility === "internal" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}
                >
                  {c.visibility === "internal" && (
                    <span className="mb-1 inline-block text-xs text-amber-700">内部备注</span>
                  )}
                  <p className="text-sm text-slate-700">{c.body}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {new Date(c.created_at).toLocaleString("zh-CN")}
                  </p>
                </div>
              ))
            )}
          </div>
          <form onSubmit={handleComment} className="space-y-2">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="输入评论..."
              rows={3}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            {mode === "agent" && (
              <div className="flex gap-3 text-sm">
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    checked={visibility === "public"}
                    onChange={() => setVisibility("public")}
                  />
                  对外评论
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    checked={visibility === "internal"}
                    onChange={() => setVisibility("internal")}
                  />
                  内部备注
                </label>
              </div>
            )}
            <button
              type="submit"
              disabled={submitting || !comment.trim()}
              className="rounded-md bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-900 disabled:opacity-50"
            >
              发送
            </button>
          </form>
        </section>

        <section className="w-full lg:w-72">
          <h3 className="text-sm font-semibold text-slate-700">时间线</h3>
          <ol className="mt-3 space-y-3">
            {timeline.length === 0 ? (
              <p className="text-sm text-slate-400">暂无记录</p>
            ) : (
              timeline.map((e) => (
                <li key={e.id} className="relative border-l-2 border-slate-200 pl-4">
                  <p className="text-xs font-medium text-slate-600">{e.event_type}</p>
                  {e.payload && typeof e.payload === "object" && "to" in e.payload && (
                    <p className="text-xs text-slate-500">
                      → {STATUS_LABELS[e.payload.to as keyof typeof STATUS_LABELS] || String(e.payload.to)}
                    </p>
                  )}
                  <p className="text-xs text-slate-400">
                    {new Date(e.created_at).toLocaleString("zh-CN")}
                  </p>
                </li>
              ))
            )}
          </ol>
        </section>
      </div>
    </div>
  );
}
