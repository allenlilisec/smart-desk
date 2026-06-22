/**
 * /portal 报单人门户首页
 * 提供新建工单表单入口
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, AlertCircle, FilePlus, List, User } from 'lucide-react';
import { api } from '@/lib/api';
import type { TicketPriority, TicketCreate } from '@/types/ticket';
import { PORTAL_TEST_IDS } from '@/lib/test-ids';

// 测试定位点别名
const TEST_IDS = PORTAL_TEST_IDS;

const priorityOptions: { value: TicketPriority; label: string; color: string }[] = [
  { value: 'P1', label: '紧急', color: 'bg-red-500' },
  { value: 'P2', label: '高', color: 'bg-orange-500' },
  { value: 'P3', label: '中', color: 'bg-yellow-500' },
  { value: 'P4', label: '低', color: 'bg-green-500' },
];

const categoryOptions = [
  { value: '550e8400-e29b-41d4-a716-446655440010', label: '登录问题' },
  { value: '550e8400-e29b-41d4-a716-446655440011', label: '密码相关' },
  { value: '550e8400-e29b-41d4-a716-446655440012', label: '系统缺陷' },
  { value: '550e8400-e29b-41d4-a716-446655440013', label: '功能建议' },
];

export default function PortalPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdTicket, setCreatedTicket] = useState<{ id: string; number: string } | null>(null);

  const [formData, setFormData] = useState<{
    title: string;
    description: string;
    categoryId: string;
    priority: TicketPriority;
  }>({
    title: '',
    description: '',
    categoryId: '',
    priority: 'P3',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const ticketData: TicketCreate = {
        title: formData.title,
        description: formData.description,
        category_id: formData.categoryId || null,
        priority: formData.priority,
      };

      const ticket = await api.createTicket(ticketData);
      setCreatedTicket({ id: ticket.id, number: ticket.number });
      setSuccess(true);
      setFormData({ title: '', description: '', categoryId: '', priority: 'P3' });
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const navigateToMyTickets = () => {
    router.push('/portal/my-tickets');
  };

  const navigateToTicketDetail = () => {
    if (createdTicket) {
      router.push(`/portal/my-tickets?highlight=${createdTicket.id}`);
    }
  };

  return (
    <div data-testid={TEST_IDS.PAGE_CONTAINER} className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <User className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">报单人门户</h1>
              <p className="text-sm text-gray-500">提交新工单或查看我的工单</p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={navigateToMyTickets}
            data-testid={TEST_IDS.MY_TICKETS_LINK}
          >
            <List className="h-4 w-4 mr-2" />
            我的工单
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* New Ticket Form */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <FilePlus className="h-5 w-5 text-primary" />
                  <CardTitle>新建工单</CardTitle>
                </div>
                <CardDescription>
                  请填写以下信息提交新的支持请求
                </CardDescription>
              </CardHeader>
              <CardContent>
                {success && createdTicket && (
                  <Alert className="mb-6 bg-green-50 border-green-200" data-testid={TEST_IDS.SUCCESS_MESSAGE}>
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-800">
                      <div className="flex flex-col gap-2">
                        <span>
                          工单提交成功！工单号：<strong>{createdTicket.number}</strong>
                        </span>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={navigateToTicketDetail}>
                            查看工单
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setSuccess(false)}>
                            继续提交
                          </Button>
                        </div>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                {error && (
                  <Alert className="mb-6 bg-red-50 border-red-200" data-testid={TEST_IDS.ERROR_MESSAGE}>
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-red-800">{error}</AlertDescription>
                  </Alert>
                )}

                <form data-testid={TEST_IDS.NEW_TICKET_FORM} onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="title">
                      标题 <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="title"
                      data-testid={TEST_IDS.TITLE_INPUT}
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="简要描述您的问题"
                      required
                      maxLength={200}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">
                      详细描述 <span className="text-red-500">*</span>
                    </Label>
                    <Textarea
                      id="description"
                      data-testid={TEST_IDS.DESCRIPTION_INPUT}
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="请详细描述您遇到的问题，包括错误信息、操作步骤等"
                      required
                      rows={5}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="category">分类</Label>
                      <Select
                        value={formData.categoryId}
                        onValueChange={(value) => setFormData({ ...formData, categoryId: value })}
                      >
                        <SelectTrigger id="category" data-testid={TEST_IDS.CATEGORY_SELECT}>
                          <SelectValue placeholder="选择问题分类" />
                        </SelectTrigger>
                        <SelectContent>
                          {categoryOptions.map((cat) => (
                            <SelectItem key={cat.value} value={cat.value}>
                              {cat.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="priority">优先级</Label>
                      <Select
                        value={formData.priority}
                        onValueChange={(value) => setFormData({ ...formData, priority: value as TicketPriority })}
                      >
                        <SelectTrigger id="priority" data-testid={TEST_IDS.PRIORITY_SELECT}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {priorityOptions.map((p) => (
                            <SelectItem key={p.value} value={p.value}>
                              <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${p.color}`} />
                                {p.label} ({p.value})
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      data-testid={TEST_IDS.SUBMIT_BUTTON}
                      disabled={loading || !formData.title.trim() || !formData.description.trim()}
                    >
                      {loading ? '提交中...' : '提交工单'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar Info */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">优先级说明</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {priorityOptions.map((p) => (
                  <div key={p.value} className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono">
                      {p.value}
                    </Badge>
                    <span className="text-sm text-gray-600">{p.label}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">快速链接</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={navigateToMyTickets}
                >
                  <List className="h-4 w-4 mr-2" />
                  我的工单列表
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
