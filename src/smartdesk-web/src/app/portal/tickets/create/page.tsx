'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface FormErrors {
  title?: string
  category?: string
  description?: string
}

export default function CreateTicket() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('P2')
  const [errors, setErrors] = useState<FormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)

  useEffect(() => {
    // 检查登录状态
    const checkAuth = () => {
      const token = localStorage.getItem('auth_token')
      if (!token) {
        router.push('/portal/login')
        return false
      }
      return true
    }

    // 立即检查一次
    if (!checkAuth()) {
      setIsCheckingAuth(false)
      return
    }
    setIsCheckingAuth(false)

    // 监听 storage 变化（用于 E2E 测试中动态设置登录状态）
    const handleStorageChange = () => {
      checkAuth()
    }
    window.addEventListener('storage', handleStorageChange)

    // 定期检查登录状态（用于 E2E 测试）
    const interval = setInterval(() => {
      const token = localStorage.getItem('auth_token')
      if (!token) {
        router.push('/portal/login')
      }
    }, 100)

    // 3秒后停止定期检查
    const timeout = setTimeout(() => {
      clearInterval(interval)
    }, 3000)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [router])

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}

    if (!title.trim()) {
      newErrors.title = '请填写工单标题'
    }

    if (!category) {
      newErrors.category = '请选择工单分类'
    }

    if (!description.trim()) {
      newErrors.description = '请填写工单描述'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)

    try {
      // 调用 API 创建工单
      const response = await fetch('/api/v1/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}`,
        },
        body: JSON.stringify({
          title,
          category,
          description,
          priority,
        }),
      })

      if (!response.ok) {
        throw new Error('创建工单失败')
      }

      const data = await response.json()
      
      // 显示成功提示
      setShowSuccess(true)
      
      // 延迟跳转到工单详情页
      setTimeout(() => {
        router.push(`/portal/tickets/${data.data.id}`)
      }, 500)
    } catch (err) {
      setErrors({ title: '创建工单失败，请重试' })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div data-testid="create-ticket-loading" className="text-gray-600">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center gap-4">
            <Link
              href="/portal"
              className="text-blue-600 hover:text-blue-800"
            >
              ← 返回门户
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">新建工单</h1>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {showSuccess && (
          <div
            data-testid="success-toast"
            className="mb-6 p-4 bg-green-100 text-green-800 rounded-lg"
          >
            工单创建成功！正在跳转...
          </div>
        )}

        <form
          data-testid="ticket-create-form"
          onSubmit={handleSubmit}
          className="bg-white p-6 rounded-lg shadow"
        >
          <div className="mb-6">
            <label
              htmlFor="title"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              工单标题 <span className="text-red-500">*</span>
            </label>
            <input
              id="title"
              type="text"
              data-testid="ticket-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="请输入工单标题"
              className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.title ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.title && (
              <p data-testid="title-error" className="mt-1 text-sm text-red-600">
                {errors.title}
              </p>
            )}
          </div>

          <div className="mb-6">
            <label
              htmlFor="category"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              工单分类 <span className="text-red-500">*</span>
            </label>
            <select
              id="category"
              data-testid="ticket-category-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.category ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="">请选择分类</option>
              <option value="access_request">访问权限申请</option>
              <option value="bug_report">缺陷报告</option>
              <option value="feature_request">功能需求</option>
              <option value="network">网络问题</option>
              <option value="hardware">硬件故障</option>
              <option value="software">软件问题</option>
              <option value="other">其他</option>
            </select>
            {errors.category && (
              <p className="mt-1 text-sm text-red-600">{errors.category}</p>
            )}
          </div>

          <div className="mb-6">
            <label
              htmlFor="priority"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              优先级
            </label>
            <select
              id="priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="P0">P0 - 紧急</option>
              <option value="P1">P1 - 高</option>
              <option value="P2">P2 - 中</option>
              <option value="P3">P3 - 低</option>
            </select>
          </div>

          <div className="mb-6">
            <label
              htmlFor="description"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              问题描述 <span className="text-red-500">*</span>
            </label>
            <textarea
              id="description"
              data-testid="ticket-description-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="请详细描述您遇到的问题..."
              rows={6}
              className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.description ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.description && (
              <p className="mt-1 text-sm text-red-600">{errors.description}</p>
            )}
          </div>

          <div className="flex justify-end gap-4">
            <Link
              href="/portal"
              className="px-6 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
            >
              取消
            </Link>
            <button
              type="submit"
              data-testid="ticket-submit-button"
              disabled={isSubmitting}
              className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-400"
            >
              {isSubmitting ? '提交中...' : '提交工单'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
