/**
 * /agent/queue 坐席工单队列
 * 展示待处理工单列表
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Search, Ticket, Eye, User, Clock, CheckCircle2, RotateCcw } from 'lucide-react';
import { api } from '@/lib/api';
import type { Ticket as TicketType, TicketStatus, TicketPriority } from '@/types/ticket';
import { AGENT_QUEUE_TEST_IDS } from '@/lib/test-ids';

// 测试定位点别名
const TEST_IDS = AGENT_QUEUE_TEST_IDS;

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

export default function AgentQueuePage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<TicketType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  useEffect(() => {
    loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const loadTickets = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getTickets({
        status: statusFilter || undefined,
        page: 1,
        page_size: 20,
      });
      setTickets(response.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载工单失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptTicket = async (ticketId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.transitionTicket(ticketId, { action: 'accept' });
      // 刷新列表
      loadTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : '接单失败');
    }
  };

  const filteredTickets = tickets.filter((ticket) =>
    searchQuery
      ? ticket.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ticket.number.toLowerCase().includes(searchQuery.toLowerCase())
      : true
  );

  const navigateToTicketDetail = (ticketId: string) => {
    router.push(`/agent/tickets/${ticketId}`);
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

  return (
    <div data-testid={TEST_IDS.PAGE_CONTAINER} className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Ticket className="h-6 w-6 text-primary" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">坐席工作台</h1>
                <p className="text-sm text-gray-500">工单队列管理</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={loadTickets}>
              <RotateCcw className="h-4 w-4 mr-2" />
              刷新
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="搜索工单标题或编号..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid={TEST_IDS.SEARCH_INPUT}
                  className="pl-10"
                />
              </div>
              <div className="w-full sm:w-48">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger data-testid={TEST_IDS.STATUS_FILTER}>
                    <SelectValue placeholder="筛选状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">全部状态</SelectItem>
                    <SelectItem value="new">新建</SelectItem>
                    <SelectItem value="accepted">已受理</SelectItem>
                    <SelectItem value="in_progress">处理中</SelectItem>
                    <SelectItem value="pending_user">等待用户</SelectItem>
                    <SelectItem value="resolved">已解决</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Error Message */}
        {error && (
          <Alert className="mb-6 bg-red-50 border-red-200" data-testid={TEST_IDS.ERROR_MESSAGE}>
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">{error}</AlertDescription>
          </Alert>
        )}

        {/* Tickets Queue */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ticket className="h-5 w-5 text-primary" />
              工单队列
              <Badge variant="secondary" className="ml-2">
                {filteredTickets.length}
              </Badge>
            </CardTitle>
            <CardDescription>共 {tickets.length} 个工单</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div data-testid={TEST_IDS.LOADING_STATE} className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                <span className="ml-3 text-gray-500">加载中...</span>
              </div>
            ) : filteredTickets.length === 0 ? (
              <div data-testid={TEST_IDS.EMPTY_STATE} className="text-center py-12">
                <Ticket className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {searchQuery ? '没有找到匹配的工单' : '暂无待处理工单'}
                </h3>
                <p className="text-gray-500 mb-4">
                  {searchQuery ? '请尝试其他搜索词' : '工单队列为空'}
                </p>
              </div>
            ) : (
              <div data-testid={TEST_IDS.QUEUE_LIST} className="space-y-3">
                {filteredTickets.map((ticket) => {
                  const status = statusConfig[ticket.status];
                  const priority = priorityConfig[ticket.priority];

                  return (
                    <div
                      key={ticket.id}
                      data-testid={TEST_IDS.TICKET_ITEM}
                      data-ticket-id={ticket.id}
                      className="p-4 rounded-lg border bg-white hover:shadow-md transition-all"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
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
                          <h3
                            data-testid={TEST_IDS.TICKET_TITLE}
                            className="font-medium text-gray-900 mb-2"
                          >
                            {ticket.title}
                          </h3>
                          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                            <span
                              data-testid={TEST_IDS.TICKET_STATUS}
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${status.bgColor} ${status.color}`}
                            >
                              {status.label}
                            </span>
                            <span
                              data-testid={TEST_IDS.TICKET_REQUESTER}
                              className="flex items-center gap-1"
                            >
                              <User className="h-3 w-3" />
                              {ticket.assignee_id ? '已分配' : '未分配'}
                            </span>
                            <span
                              data-testid={TEST_IDS.TICKET_CREATED_AT}
                              className="flex items-center gap-1"
                            >
                              <Clock className="h-3 w-3" />
                              {formatDate(ticket.created_at)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {ticket.status === 'new' && (
                            <Button
                              size="sm"
                              data-testid={TEST_IDS.ACCEPT_BUTTON}
                              onClick={(e) => handleAcceptTicket(ticket.id, e)}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                              接单
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            data-testid={TEST_IDS.VIEW_BUTTON}
                            onClick={() => navigateToTicketDetail(ticket.id)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            查看
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
