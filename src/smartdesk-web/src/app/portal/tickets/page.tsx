'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Ticket {
  id: string
  title: string
  category: string
  status: string
  priority: string
  createdAt: string
  updatedAt: string
}

const statusMap: { [key: string]: string } = {
  new: '新工单',
  open: '已打开',
  in_progress: '处理中',
  resolved: '已解决',
  closed: '已关闭',
}

const categoryMap: { [key: string]: string } = {
  access_request: '访问权限申请',
  bug_report: '缺陷报告',
  feature_request: '功能需求',
  network: '网络问题',
  hardware: '硬件故障',
  software: '软件问题',
  other: '其他',
}

export default function TicketList() {
  const router = useRouter()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [error, setError] = useState('')

  useEffect(() => {
    // 检查登录状态
    const token = localStorage.getItem('auth_token')
    if (!token) {
      router.push('/portal/login')
      return
    }

    // 加载工单列表
    loadTickets()
  }, [router])

  const loadTickets = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/v1/tickets', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}`,
        },
      })

      if (!response.ok) {
        throw new Error('加载工单失败')
      }

      const data = await response.json()
      setTickets(data.data.items || [])
    } catch (err) {
      setError('加载工单列表失败')
    } finally {
      setIsLoading(false)
    }
  }

  const filteredTickets = tickets.filter((ticket) => {
    const matchesSearch = ticket.title.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter ? ticket.status === statusFilter : true
    return matchesSearch && matchesStatus
  })

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">加载中...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center gap-4">
            <Link href="/portal" className="text-blue-600 hover:text-blue-800">
              ← 返回门户
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">我的工单</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {error && (
          <div className="mb-4 p-4 bg-red-100 text-red-700 rounded" role="alert">
            {error}
          </div>
        )}

        {/* 搜索和筛选 */}
        <div className="mb-6 bg-white p-4 rounded-lg shadow flex gap-4">
          <div className="flex-1">
            <input
              type="text"
              data-testid="ticket-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索工单标题..."
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            data-testid="ticket-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">所有状态</option>
            <option value="new">新工单</option>
            <option value="open">已打开</option>
            <option value="in_progress">处理中</option>
            <option value="resolved">已解决</option>
            <option value="closed">已关闭</option>
          </select>
          <button
            data-testid="ticket-search-button"
            onClick={() => {}}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            搜索
          </button>
        </div>

        {/* 工单列表 */}
        <div data-testid="ticket-list" className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  工单标题
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  分类
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  状态
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  优先级
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  创建时间
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredTickets.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    暂无工单
                  </td>
                </tr>
              ) : (
                filteredTickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    data-testid="ticket-list-row"
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => router.push(`/portal/tickets/${ticket.id}`)}
                  >
                    <td
                      data-testid="ticket-title-cell"
                      className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 truncate max-w-xs"
                    >
                      {ticket.title}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {categoryMap[ticket.category] || ticket.category}
                    </td>
                    <td
                      data-testid="ticket-status-cell"
                      className="px-6 py-4 whitespace-nowrap"
                    >
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          ticket.status === 'new'
                            ? 'bg-blue-100 text-blue-800'
                            : ticket.status === 'in_progress'
                            ? 'bg-yellow-100 text-yellow-800'
                            : ticket.status === 'resolved'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {statusMap[ticket.status] || ticket.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {ticket.priority}
                    </td>
                    <td
                      data-testid="ticket-created-at-cell"
                      className="px-6 py-4 whitespace-nowrap text-sm text-gray-500"
                    >
                      {new Date(ticket.createdAt).toLocaleString('zh-CN')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 新建工单按钮 */}
        <div className="mt-6">
          <Link
            href="/portal/tickets/create"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            + 新建工单
          </Link>
        </div>
      </main>
    </div>
  )
}
