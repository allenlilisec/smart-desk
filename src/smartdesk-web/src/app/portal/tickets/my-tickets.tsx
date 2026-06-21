'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Ticket } from '@/types';

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

export default function MyTickets() {
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
      <header className="mb-6">
        <h1 className="text-2xl font-bold">我的工单</h1>
      </header>

      <section data-testid="ticket-list" className="rounded border border-gray-200 bg-white shadow">
        {loading ? (
          <div className="p-4 text-center text-gray-500">加载中...</div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2">标题</th>
                <th className="px-4 py-2">状态</th>
                <th className="px-4 py-2">优先级</th>
                <th className="px-4 py-2">创建时间</th>
              </tr>
            </thead>
            <tbody>
              {tickets.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <div data-testid="empty-state" className="empty-state p-4 text-center text-gray-500">
                      暂无工单
                    </div>
                  </td>
                </tr>
              ) : (
                tickets.map(ticket => (
                  <tr key={ticket.id} data-testid="ticket-item" className="ticket-item">
                    <td className="px-4 py-2">
                      <Link href={`/portal/tickets/${ticket.id}`} className="text-blue-600 hover:underline">
                        {ticket.title}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{statusMap[ticket.status] || ticket.status}</td>
                    <td className="px-4 py-2">{ticket.priority}</td>
                    <td className="px-4 py-2">{new Date(ticket.created_at).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
