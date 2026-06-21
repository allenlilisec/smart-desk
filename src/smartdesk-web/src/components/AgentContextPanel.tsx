"use client";

import { useState } from "react";
import { InlineRetry } from "./ui";

export function AgentContextPanel() {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <aside className="hidden w-12 shrink-0 border-l border-line bg-white xl:flex xl:items-start xl:justify-center xl:py-4">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="rounded-md border border-line px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          展开
        </button>
      </aside>
    );
  }

  return (
    <aside className="hidden w-[360px] shrink-0 border-l border-line bg-white xl:block">
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-4">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">Context</p>
          <h2 className="mt-1 text-sm font-semibold text-slate-900">客户上下文</h2>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="rounded-md border border-line px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          收起
        </button>
      </div>
      <div className="space-y-3 overflow-auto p-4">
        <section className="rounded-lg border border-line bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-800">客户信息</h3>
          <p className="mt-3 text-sm text-slate-600">客户上下文暂未接入。</p>
        </section>

        <InlineRetry title="最近工单为空" description="等待 SUP-280 契约接入客户历史工单。" />
        <InlineRetry title="相似工单待接入" description="后续通过独立端点懒加载，失败不阻塞详情主体。" />
        <InlineRetry title="AI 建议待接入" description="后续仅展示 category_id / confidence / priority / applied。" />
        <InlineRetry title="满意度与坐席绩效待接入" description="暂无服务质量数据。" />
        <InlineRetry title="静态弱冲突提示待接入" description="暂无协作冲突数据。" />
      </div>
    </aside>
  );
}
