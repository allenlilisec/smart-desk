'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface Ticket {
  id: string
  title: string
  description: string
  category: string
  status: string
  priority: string
  requesterId: string
  requesterName: string
  assigneeId: string | null
  assigneeName: string | null
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

export default function TicketDetail() {
  const params = useParams()
  const router = useRouter()
  const ticketId = params.id as string
  
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    // 检查登录状态
    const token = localStorage.getItem('auth_token')
    if (!token) {
      router.push('/portal/login')
      return
    }

    // 加载工单详情
    loadTicket()
  }, [ticketId, router])

  const loadTicket = async () => {
    try {
      setIsLoading(true)
      const response = await fetch(`/api/v1/tickets/${ticketId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}`,
        },
      })

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('工单不存在')
        }
        throw new Error('加载工单失败')
      }

      const data = await response.json()
      setTicket(data.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载工单详情失败')
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">加载中...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-red-600">{error}</div>
      </div>
    )
  }

  if (!ticket) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">工单不存在</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center gap-4">
            <Link
              href="/portal/tickets"
              className="text-blue-600 hover:text-blue-800"
            >
              ← 返回工单列表
            </Link>
            <h1
              data-testid="ticket-title"
              className="text-2xl font-bold text-gray-900"
            >
              {ticket.title}
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow p-6">
          {/* 工单基本信息 */}
          <div className="grid grid-cols-2 gap-6 mb-8">
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">
                工单状态
              </label>
              <span
                data-testid="ticket-status"
                className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${
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
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">
                工单分类
              </label>
              <span className="text-gray-900">
                {categoryMap[ticket.category] || ticket.category}
              </span>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">
                优先级
              </label>
              <span className="text-gray-900">{ticket.priority}</span>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">
                创建时间
              </label>
              <span className="text-gray-900">
                {new Date(ticket.createdAt).toLocaleString('zh-CN')}
              </span>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">
                创建人
              </label>
              <span className="text-gray-900">{ticket.requesterName}</span>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">
                处理人
              </label>
              <span className="text-gray-900">
                {ticket.assigneeName || '待分派'}
              </span>
            </div>
          </div>

          {/* 工单描述 */}
          <div className="mb-8">
            <label className="block text-sm font-medium text-gray-500 mb-2">
              问题描述
            </label>
            <div className="bg-gray-50 p-4 rounded">
              <p className="text-gray-900 whitespace-pre-wrap">
                {ticket.description}
              </p>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex justify-end gap-4">
            <Link
              href="/portal/tickets"
              className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
            >
              返回列表
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
