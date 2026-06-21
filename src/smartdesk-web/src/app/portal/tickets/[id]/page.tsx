/**
 * /portal/tickets/[id] 工单详情页（报单人视角）
 * 展示工单详情、评论列表
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, ArrowLeft, MessageCircle, Clock, User, Send } from 'lucide-react';
import { api } from '@/lib/api';
import type { TicketAggregate, Comment, TicketStatus, TicketPriority } from '@/types/ticket';
import { PORTAL_TICKET_DETAIL_TEST_IDS } from '@/lib/test-ids';

// 测试定位点别名
const TEST_IDS = PORTAL_TICKET_DETAIL_TEST_IDS;

const statusConfig: Record<TicketStatus, { label: string; color: string; bgColor: string }> = {
  new: { label: '新建', color: 'text-blue-600', bgColor: 'bg-blue-50' },
  accepted: { label: '已受理', color: 'text-indigo-600', bgColor: 'bg-indigo-50' },
  in_progress: { label: '处理中', color: 'text-yellow-600', bgColor: 'bg-yellow-50' },
  pending_user: { label: '等待用户', color: 'text-orange-600', bgColor: 'bg-orange-50' },
  resolved: { label: '已解决', color: 'text-green-600', bgColor: 'bg-green-50' },
  closed: { label: '已关闭', color: 'text-gray-600', bgColor: 'bg-gray-50' },
  suspended: { label: '已暂停', color: 'text-purple-600', bgColor: 'bg-purple-50' },
  cancelled: { label: '已取消', color: 'text-red-600', bgColor: 'bg-red-50' },
};

const priorityConfig: Record<TicketPriority, { label: string; color: string }> = {
  P1: { label: '紧急', color: 'bg-red-500' },
  P2: { label: '高', color: 'bg-orange-500' },
  P3: { label: '中', color: 'bg-yellow-500' },
  P4: { label: '低', color: 'bg-green-500' },
};

export default function TicketDetailPage() {
  const router = useRouter();
  const params = useParams();
  const ticketId = params.id as string;

  const [ticket, setTicket] = useState<TicketAggregate | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  useEffect(() => {
    if (ticketId) {
      loadTicketDetail();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  const loadTicketDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const ticketData = await api.getTicket(ticketId);
      setTicket(ticketData);

      const commentsData = await api.getComments(ticketId);
      // 只显示公开评论
      setComments(commentsData.items.filter(c => c.visibility === 'public'));
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载工单详情失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;

    setSubmittingComment(true);
    try {
      await api.createComment(ticketId, {
        body: newComment,
        visibility: 'public',
      });
      setNewComment('');
      // 重新加载评论
      const commentsData = await api.getComments(ticketId);
      setComments(commentsData.items.filter(c => c.visibility === 'public'));
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加评论失败');
    } finally {
      setSubmittingComment(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div data-testid={TEST_IDS.LOADING_STATE} className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        <span className="ml-3 text-gray-500">加载中...</span>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <Alert data-testid={TEST_IDS.ERROR_MESSAGE} className="bg-red-50 border-red-200">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">{error || '工单不存在'}</AlertDescription>
        </Alert>
        <Button className="mt-4" onClick={() => router.push('/portal/my-tickets')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回工单列表
        </Button>
      </div>
    );
  }

  const status = statusConfig[ticket.status];
  const priority = priorityConfig[ticket.priority];

  return (
    <div data-testid={TEST_IDS.PAGE_CONTAINER} className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/portal/my-tickets')}
                data-testid={TEST_IDS.BACK_BUTTON}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                返回列表
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Ticket Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Ticket Details */}
            <Card data-testid={TEST_IDS.TICKET_INFO}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        data-testid={TEST_IDS.TICKET_NUMBER}
                        className="font-mono text-sm text-gray-500"
                      >
                        {ticket.number}
                      </span>
                      <Badge
                        data-testid={TEST_IDS.TICKET_PRIORITY}
                        className={`${priority.color} text-white`}
                      >
                        {priority.label}
                      </Badge>
                    </div>
                    <h1
                      data-testid={TEST_IDS.TICKET_TITLE}
                      className="text-xl font-bold text-gray-900"
                    >
                      {ticket.title}
                    </h1>
                  </div>
                  <span
                    data-testid={TEST_IDS.TICKET_STATUS}
                    className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${status.bgColor} ${status.color}`}
                  >
                    {status.label}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div data-testid={TEST_IDS.TICKET_DESCRIPTION}>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">问题描述</h3>
                  <p className="text-gray-600 whitespace-pre-wrap">{ticket.description}</p>
                </div>

                <div className="border-t pt-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">创建时间</span>
                      <p className="font-medium flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(ticket.created_at)}
                      </p>
                    </div>
                    {ticket.csat_score && (
                      <div>
                        <span className="text-gray-500">满意度评分</span>
                        <p className="font-medium text-green-600 mt-1">★ {ticket.csat_score}/5</p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Comments */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="h-5 w-5 text-primary" />
                  评论 ({comments.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div data-testid={TEST_IDS.COMMENTS_LIST} className="space-y-4 mb-6">
                  {comments.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <MessageCircle className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                      暂无评论
                    </div>
                  ) : (
                    comments.map((comment) => (
                      <div
                        key={comment.id}
                        data-testid={TEST_IDS.COMMENT_ITEM}
                        data-comment-id={comment.id}
                        className="p-4 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-gray-400" />
                            <span
                              data-testid={TEST_IDS.COMMENT_AUTHOR}
                              className="font-medium text-sm text-gray-700"
                            >
                              {comment.author_id === ticket.requester?.id ? '我' : '客服'}
                            </span>
                          </div>
                          <span
                            data-testid={TEST_IDS.COMMENT_TIME}
                            className="text-xs text-gray-500"
                          >
                            {formatDate(comment.created_at)}
                          </span>
                        </div>
                        <p
                          data-testid={TEST_IDS.COMMENT_BODY}
                          className="text-gray-700 whitespace-pre-wrap"
                        >
                          {comment.body}
                        </p>
                      </div>
                    ))
                  )}
                </div>

                {/* Add Comment Form */}
                <div data-testid={TEST_IDS.ADD_COMMENT_FORM} className="border-t pt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">添加回复</h4>
                  <Textarea
                    data-testid={TEST_IDS.COMMENT_INPUT}
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="输入您的回复..."
                    rows={3}
                    className="mb-3"
                  />
                  <div className="flex justify-end">
                    <Button
                      data-testid={TEST_IDS.SUBMIT_COMMENT_BUTTON}
                      onClick={handleAddComment}
                      disabled={!newComment.trim() || submittingComment}
                    >
                      <Send className="h-4 w-4 mr-2" />
                      {submittingComment ? '发送中...' : '发送回复'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Sidebar */}
          <div className="space-y-4">
            {/* Requester Info */}
            {ticket.requester && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">报单人信息</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-gray-400" />
                    <span className="font-medium">{ticket.requester.display_name}</span>
                  </div>
                  {ticket.requester.email && (
                    <p className="text-sm text-gray-500">{ticket.requester.email}</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* SLA Info */}
            {ticket.sla && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">SLA信息</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <span className="text-xs text-gray-500">响应截止</span>
                    <p className="text-sm font-medium">
                      {formatDate(ticket.sla.response_due_at)}
                    </p>
                    <Badge
                      variant={ticket.sla.response_met ? 'default' : 'destructive'}
                      className="mt-1"
                    >
                      {ticket.sla.response_met ? '已响应' : '待响应'}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">解决截止</span>
                    <p className="text-sm font-medium">
                      {formatDate(ticket.sla.resolve_due_at)}
                    </p>
                    <Badge
                      variant={ticket.sla.resolve_met ? 'default' : 'destructive'}
                      className="mt-1"
                    >
                      {ticket.sla.resolve_met ? '已解决' : '处理中'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
