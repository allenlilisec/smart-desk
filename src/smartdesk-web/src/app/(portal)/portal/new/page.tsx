"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";

const PRIORITIES = [
  { value: "P1", label: "P1 · 紧急" },
  { value: "P2", label: "P2 · 高" },
  { value: "P3", label: "P3 · 中" },
  { value: "P4", label: "P4 · 低" },
];

export default function NewTicketPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("P3");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError("请填写标题和描述");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const ticket = await api.createTicket({
        title: title.trim(),
        description: description.trim(),
        priority,
      });
      router.push(`/portal/${ticket.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell title="提交工单">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <Link href="/portal" className="text-sm text-brand-600 hover:underline">
          ← 返回我的工单
        </Link>

        <form
          onSubmit={handleSubmit}
          className="mt-4 space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h2 className="text-lg font-semibold text-slate-900">新建工单</h2>

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          <label className="block text-sm font-medium text-slate-700">
            标题 <span className="text-red-500">*</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="简要描述问题"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            详细描述 <span className="text-red-500">*</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={6}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="请详细说明问题现象、影响范围、已尝试的解决方法等"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            优先级
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-brand-500 px-6 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {submitting ? "提交中..." : "提交工单"}
            </button>
            <Link
              href="/portal"
              className="rounded-lg border border-slate-200 px-6 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              取消
            </Link>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
