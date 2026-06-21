/**
 * /agent/tickets/[id] 坐席工单详情页
 * 支持评论、状态流转、内部备注
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, ArrowLeft, MessageCircle, Clock, User, Send, EyeOff, Play, CheckCircle2, RotateCcw, XCircle, PauseCircle } from 'lucide-react';
import { api } from '@/lib/api';
import type { TicketAggregate, Comment, TicketStatus, TicketPriority, TransitionAction, CommentVisibility } from '@/types/ticket';
import { AGENT_TICKET_DETAIL_TEST_IDS } from '@/lib/test-ids';

// 测试定位点别名
const TEST_IDS = AGENT_TICKET_DETAIL_TEST_IDS;

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

const transitionConfig: Record<TransitionAction, { label: string; icon: React.ReactNode; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  accept: { label: '接单', icon: <CheckCircle2 className="h-4 w-4" />, variant: 'default' },
  start: { label: '开始处理', icon: <Play className="h-4 w-4" />, variant: 'default' },
  wait_user: { label: '等待用户', icon: <PauseCircle className="h-4 w-4" />, variant: 'secondary' },
  resolve: { label: '标记解决', icon: <CheckCircle2 className="h-4 w-4" />, variant: 'default' },
  close: { label: '关闭工单', icon: <XCircle className="h-4 w-4" />, variant: 'destructive' },
  reopen: { label: '重新打开', icon: <RotateCcw className="h-4 w-4" />, variant: 'secondary' },
  suspend: { label: '暂停', icon: <PauseCircle className="h-4 w-4" />, variant: 'secondary' },
  resume: { label: '恢复', icon: <Play className="h-4 w-4" />, variant: 'default' },
  cancel: { label: '取消', icon: <XCircle className="h-4 w-4" />, variant: 'destructive' },
};

const availableTransitions: Record<TicketStatus, TransitionAction[]> = {
  new: ['accept', 'cancel'],
  accepted: ['start', 'suspend', 'cancel'],
  in_progress: ['wait_user', 'resolve', 'suspend', 'cancel'],
  pending_user: ['start', 'resolve', 'cancel'],
  resolved: ['close', 'reopen'],
  closed: ['reopen'],
  suspended: ['resume', 'cancel'],
  cancelled: ['reopen'],
};

export default function AgentTicketDetailPage() {
  const router = useRouter();
  const params = useParams();
  const ticketId = params.id as string;

  const [ticket, setTicket] = useState<TicketAggregate | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [commentVisibility, setCommentVisibility] = useState<CommentVisibility>('public');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [selectedTransition, setSelectedTransition] = useState<TransitionAction | ''>('');
  const [transitionLoading, setTransitionLoading] = useState(false);

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
      setComments(commentsData.items);
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
        visibility: commentVisibility,
      });
      setNewComment('');
      // 重新加载评论
      const commentsData = await api.getComments(ticketId);
      setComments(commentsData.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加评论失败');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleTransition = async () => {
    if (!selectedTransition) return;

    setTransitionLoading(true);
    try {
      await api.transitionTicket(ticketId, { action: selectedTransition });
      // 刷新工单数据
      await loadTicketDetail();
      setSelectedTransition('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '状态流转失败');
    } finally {
      setTransitionLoading(false);
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
        <Button className="mt-4" onClick={() => router.push('/agent/queue')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回队列
        </Button>
      </div>
    );
  }

  const status = statusConfig[ticket.status];
  const priority = priorityConfig[ticket.priority];
  const transitions = availableTransitions[ticket.status] || [];

  const publicComments = comments.filter(c => c.visibility === 'public');
  const internalComments = comments.filter(c => c.visibility === 'internal');

  return (
    <div data-testid={TEST_IDS.PAGE_CONTAINER} className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/agent/queue')}
                data-testid={TEST_IDS.BACK_BUTTON}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                返回队列
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Ticket Info & Actions */}
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

                {/* Status Actions */}
                <div data-testid={TEST_IDS.STATUS_ACTIONS} className="border-t pt-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">状态操作</h3>
                  {transitions.length > 0 ? (
                    <div className="flex items-center gap-3">
                      <Select
                        value={selectedTransition}
                        onValueChange={(value) => setSelectedTransition(value as TransitionAction)}
                      >
                        <SelectTrigger data-testid={TEST_IDS.TRANSITION_SELECT} className="w-48">
                          <SelectValue placeholder="选择操作" />
                        </SelectTrigger>
                        <SelectContent>
                          {transitions.map((action) => {
                            const config = transitionConfig[action];
                            return (
                              <SelectItem key={action} value={action}>
                                <div className="flex items-center gap-2">
                                  {config.icon}
                                  {config.label}
                                </div>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <Button
                        data-testid={TEST_IDS.TRANSITION_BUTTON}
                        onClick={handleTransition}
                        disabled={!selectedTransition || transitionLoading}
                      >
                        {transitionLoading ? '执行中...' : '执行'}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">当前状态无可用操作</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Comments */}
            <Card>
              <CardHeader>
                <Tabs defaultValue="public" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="public" data-testid={TEST_IDS.COMMENTS_TAB}>
                      <MessageCircle className="h-4 w-4 mr-2" />
                      公开评论 ({publicComments.length})
                    </TabsTrigger>
                    <TabsTrigger value="internal" data-testid={TEST_IDS.INTERNAL_TAB}>
                      <EyeOff className="h-4 w-4 mr-2" />
                      内部备注 ({internalComments.length})
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="public">
                    <div data-testid={TEST_IDS.COMMENTS_LIST} className="space-y-4 mt-4">
                      {publicComments.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                          <MessageCircle className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                          暂无公开评论
                        </div>
                      ) : (
                        publicComments.map((comment) => (
                          <div
                            key={comment.id}
                            data-testid={TEST_IDS.COMMENT_ITEM}
                            data-comment-id={comment.id}
                            className="p-4 bg-blue-50 rounded-lg border border-blue-100"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-gray-400" />
                                <span className="font-medium text-sm text-gray-700">
                                  {comment.author_id === ticket.requester?.id ? '报单人' : '客服'}
                                </span>
                                <Badge variant="outline" className="text-xs">
                                  公开
                                </Badge>
                              </div>
                              <span className="text-xs text-gray-500">
                                {formatDate(comment.created_at)}
                              </span>
                            </div>
                            <p data-testid={TEST_IDS.COMMENT_BODY} className="text-gray-700 whitespace-pre-wrap">
                              {comment.body}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </TabsContent>
                  <TabsContent value="internal">
                    <div className="space-y-4 mt-4">
                      {internalComments.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                          <EyeOff className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                          暂无内部备注
                        </div>
                      ) : (
                        internalComments.map((comment) => (
                          <div
                            key={comment.id}
                            className="p-4 bg-amber-50 rounded-lg border border-amber-100"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-gray-400" />
                                <span className="font-medium text-sm text-gray-700">客服</span>
                                <Badge variant="outline" className="text-xs bg-amber-100">
                                  内部
                                </Badge>
                              </div>
                              <span className="text-xs text-gray-500">
                                {formatDate(comment.created_at)}
                              </span>
                            </div>
                            <p className="text-gray-700 whitespace-pre-wrap">{comment.body}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </CardHeader>
              <CardContent>
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
                  <div className="flex items-center justify-between">
                    <Select
                      value={commentVisibility}
                      onValueChange={(value) => setCommentVisibility(value as CommentVisibility)}
                    >
                      <SelectTrigger data-testid={TEST_IDS.VISIBILITY_SELECT} className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="public">
                          <div className="flex items-center gap-2">
                            <MessageCircle className="h-4 w-4" />
                            公开
                          </div>
                        </SelectItem>
                        <SelectItem value="internal">
                          <div className="flex items-center gap-2">
                            <EyeOff className="h-4 w-4" />
                            内部
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
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
              <Card data-testid={TEST_IDS.REQUESTER_INFO}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <User className="h-4 w-4" />
                    报单人信息
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{ticket.requester.display_name}</span>
                  </div>
                  {ticket.requester.email && (
                    <p className="text-sm text-gray-500">{ticket.requester.email}</p>
                  )}
                  <p className="text-xs text-gray-400">ID: {ticket.requester.id.slice(0, 8)}...</p>
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
                  {ticket.sla.breached && (
                    <Alert className="bg-red-50 border-red-200">
                      <AlertCircle className="h-4 w-4 text-red-600" />
                      <AlertDescription className="text-red-800">
                        SLA已超时
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Ticket Meta */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">工单信息</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">创建时间</span>
                  <span className="font-medium flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDate(ticket.created_at)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">评论数</span>
                  <span className="font-medium">{ticket.comments_count}</span>
                </div>
                {ticket.csat_score && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">满意度</span>
                    <span className="font-medium text-green-600">★ {ticket.csat_score}/5</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
