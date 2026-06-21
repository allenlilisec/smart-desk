'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { TicketAggregate, Comment } from '../../../../e2e/fixtures/types';

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

export default function PortalTicketDetail() {
  const params = useParams();
  const ticketId = params.id as string;

  const [ticket, setTicket] = useState<TicketAggregate | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ticketId) return;

    Promise.all([
      fetch(`/api/v1/tickets/${ticketId}`).then(res => res.json()),
      fetch(`/api/v1/tickets/${ticketId}/comments`).then(res => res.json()),
    ])
      .then(([ticketData, commentsData]) => {
        setTicket(ticketData);
        setComments(commentsData.items || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [ticketId]);

  if (loading) {
    return <div className="p-8">加载中...</div>;
  }

  if (!ticket) {
    return <div className="p-8">工单不存在</div>;
  }

  return (
    <main className="min-h-screen p-8">
      <div data-testid="ticket-detail" className="rounded border border-gray-200 bg-white p-6 shadow">
        <h1 data-testid="ticket-title" className="mb-4 text-2xl font-bold">
          {ticket.title}
        </h1>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">状态：</span>
            <span data-testid="ticket-status">{statusMap[ticket.status] || ticket.status}</span>
          </div>
          <div>
            <span className="text-gray-500">优先级：</span>
            <span>{ticket.priority}</span>
          </div>
          <div>
            <span className="text-gray-500">创建时间：</span>
            <span>{new Date(ticket.created_at).toLocaleString()}</span>
          </div>
        </div>
      </div>

      <section className="mt-6 rounded border border-gray-200 bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-bold">评论</h2>
        {comments.length === 0 ? (
          <div className="text-gray-500">暂无评论</div>
        ) : (
          comments.map(comment => (
            <div key={comment.id} className="mb-3 border-b border-gray-100 pb-3">
              <div className="mb-1 text-sm text-gray-500">
                {comment.author_name || comment.author_id} · {new Date(comment.created_at).toLocaleString()}
              </div>
              <p>{comment.body}</p>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
