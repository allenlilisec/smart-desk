'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Ticket } from '../../e2e/fixtures/types';

const statusMap: Record<string, string> = {
  new: '新工单',
  accepted: '已受理',
  in_progress: '处理中',
  pending_user: '待用户确认',
  resolved: '已解决',
  closed: '已关闭',
  suspended: '已挂起',
  cancelled: '已取消',
};

export default function AgentQueue() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/tickets')
      .then(res => res.json())
      .then((data: { items: Ticket[] }) => {
        setTickets(data.items || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen p-8">
      <header data-testid="agent-header" className="mb-6">
        <h1 className="text-2xl font-bold">坐席工作台</h1>
      </header>

      <section data-testid="ticket-queue" className="rounded border border-gray-200 bg-white shadow">
        <table className="w-full text-left">
          <thead data-testid="queue-header" className="bg-gray-50">
            <tr>
              <th className="px-4 py-2">标题</th>
              <th className="px-4 py-2">状态</th>
              <th className="px-4 py-2">优先级</th>
              <th className="px-4 py-2">创建人</th>
              <th className="px-4 py-2">创建时间</th>
              <th className="px-4 py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-center text-gray-500">
                  加载中...
                </td>
              </tr>
            ) : tickets.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-center text-gray-500">
                  暂无工单
                </td>
              </tr>
            ) : (
              tickets.map(ticket => (
                <tr key={ticket.id} data-testid="ticket-item" data-ticket-id={ticket.id}>
                  <td className="px-4 py-2">{ticket.title}</td>
                  <td className="px-4 py-2">{statusMap[ticket.status] || ticket.status}</td>
                  <td className="px-4 py-2">{ticket.priority}</td>
                  <td className="px-4 py-2">{ticket.requester_id}</td>
                  <td className="px-4 py-2">{new Date(ticket.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2">
                    <Link
                      href={`/agent/tickets/${ticket.id}`}
                      className="text-blue-600 hover:underline"
                      data-testid="view-ticket-link"
                    >
                      查看
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
