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

export default function AgentTicketDetailPage() {
  const params = useParams();
  const ticketId = params.id as string;

  const [ticket, setTicket] = useState<TicketAggregate | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentBody, setCommentBody] = useState('');
  const [commentVisibility, setCommentVisibility] = useState<'public' | 'internal'>('public');
  const [loading, setLoading] = useState(true);

  const fetchTicket = async () => {
    const res = await fetch(`/api/v1/tickets/${ticketId}`);
    const data = await res.json();
    setTicket(data);
  };

  const fetchComments = async () => {
    const res = await fetch(`/api/v1/tickets/${ticketId}/comments`);
    const data = await res.json();
    setComments(data.items || []);
  };

  useEffect(() => {
    if (!ticketId) return;
    Promise.all([fetchTicket(), fetchComments()]).finally(() => setLoading(false));
  }, [ticketId]);

  const handleTransition = async (action: string) => {
    await fetch(`/api/v1/tickets/${ticketId}/transitions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    await fetchTicket();
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentBody.trim()) return;

    await fetch(`/api/v1/tickets/${ticketId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: commentBody, visibility: commentVisibility }),
    });

    setCommentBody('');
    await fetchComments();
  };

  if (loading) {
    return <div className="p-8">加载中...</div>;
  }

  if (!ticket) {
    return <div className="p-8">工单不存在</div>;
  }

  return (
    <main className="min-h-screen p-8">
      <div data-testid="ticket-info" className="mb-6 rounded border border-gray-200 bg-white p-6 shadow">
        <h1 data-testid="ticket-title" className="mb-4 text-2xl font-bold">
          {ticket.title}
        </h1>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">状态：</span>
            <span data-testid="ticket-status" className="font-medium">
              {statusMap[ticket.status] || ticket.status}
            </span>
          </div>
          <div>
            <span className="text-gray-500">优先级：</span>
            <span>{ticket.priority}</span>
          </div>
          <div>
            <span className="text-gray-500">创建人：</span>
            <span>{ticket.requester?.display_name || ticket.requester_id}</span>
          </div>
          <div>
            <span className="text-gray-500">创建时间：</span>
            <span>{new Date(ticket.created_at).toLocaleString()}</span>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          {ticket.status === 'new' && (
            <button
              data-testid="accept-ticket-button"
              onClick={() => handleTransition('accept')}
              className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              接单
            </button>
          )}
          {ticket.status === 'accepted' && (
            <button
              data-testid="start-ticket-button"
              onClick={() => handleTransition('start')}
              className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              开始处理
            </button>
          )}
          {ticket.status === 'in_progress' && (
            <button
              data-testid="resolve-ticket-button"
              onClick={() => handleTransition('resolve')}
              className="rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700"
            >
              解决
            </button>
          )}
        </div>
      </div>

      <section data-testid="comments-section" className="rounded border border-gray-200 bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-bold">评论</h2>

        <form onSubmit={handleAddComment} className="mb-6">
          <div className="mb-3 flex gap-4">
            <label className="flex items-center gap-2">
              <input
                data-testid="public-comment-radio"
                type="radio"
                name="visibility"
                value="public"
                checked={commentVisibility === 'public'}
                onChange={() => setCommentVisibility('public')}
              />
              对外回复
            </label>
            <label className="flex items-center gap-2">
              <input
                data-testid="internal-comment-radio"
                type="radio"
                name="visibility"
                value="internal"
                checked={commentVisibility === 'internal'}
                onChange={() => setCommentVisibility('internal')}
              />
              内部备注
            </label>
          </div>
          <textarea
            data-testid="comment-textarea"
            value={commentBody}
            onChange={e => setCommentBody(e.target.value)}
            className="mb-3 w-full rounded border border-gray-300 p-2"
            rows={3}
            placeholder="请输入评论内容"
          />
          <button
            data-testid="submit-comment-button"
            type="submit"
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            提交评论
          </button>
        </form>

        <div data-testid="comments-list">
          {comments.length === 0 ? (
            <div data-testid="no-comments" className="text-gray-500">
              暂无评论
            </div>
          ) : (
            comments.map(comment => (
              <div
                key={comment.id}
                data-testid="comment-item"
                className="mb-3 border-b border-gray-100 pb-3"
              >
                <div className="mb-1 flex items-center gap-2 text-sm">
                  <span data-testid="comment-author" className="font-medium">
                    {comment.author_name || comment.author_id}
                  </span>
                  <span data-testid="comment-time" className="text-gray-500">
                    {new Date(comment.created_at).toLocaleString()}
                  </span>
                  <span className="text-xs text-gray-400">
                    {comment.visibility === 'internal' ? '内部' : '对外'}
                  </span>
                </div>
                <p>{comment.body}</p>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
