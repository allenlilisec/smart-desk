'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function PortalHome() {
  const router = useRouter()
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [userName, setUserName] = useState('')
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    // 检查登录状态
    const checkAuth = () => {
      const token = localStorage.getItem('auth_token')
      const name = localStorage.getItem('user_name')
      if (!token) {
        router.push('/portal/login')
        return false
      }
      setIsLoggedIn(true)
      setUserName(name || '用户')
      setIsChecking(false)
      return true
    }

    // 立即检查一次
    if (!checkAuth()) {
      setIsChecking(false)
      return
    }

    // 监听 storage 变化（用于 E2E 测试中动态设置登录状态）
    const handleStorageChange = () => {
      checkAuth()
    }
    window.addEventListener('storage', handleStorageChange)
    
    // 定期检查登录状态（用于 E2E 测试）
    const interval = setInterval(() => {
      if (!isLoggedIn) {
        checkAuth()
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
  }, [router, isLoggedIn])

  const handleLogout = () => {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('user_role')
    localStorage.removeItem('user_name')
    router.push('/portal/login')
  }

  if (isChecking || !isLoggedIn) {
    return <div data-testid="portal-loading">Loading...</div>
  }

  return (
    <div data-testid="portal-home" className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900">报单人门户</h1>
            <div className="flex items-center gap-4">
              <span className="text-gray-600">欢迎，{userName}</span>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
              >
                退出
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link
            href="/portal/tickets/create"
            data-testid="create-ticket-button"
            className="bg-blue-600 text-white p-6 rounded-lg shadow hover:bg-blue-700 transition"
          >
            <h2 className="text-xl font-semibold mb-2">新建工单</h2>
            <p className="text-blue-100">提交新的服务请求或问题反馈</p>
          </Link>

          <Link
            href="/portal/tickets"
            className="bg-white p-6 rounded-lg shadow hover:shadow-lg transition border"
          >
            <h2 className="text-xl font-semibold mb-2 text-gray-900">我的工单</h2>
            <p className="text-gray-600">查看和管理您提交的所有工单</p>
          </Link>

          <div className="bg-white p-6 rounded-lg shadow border">
            <h2 className="text-xl font-semibold mb-2 text-gray-900">帮助中心</h2>
            <p className="text-gray-600">查看常见问题解答</p>
          </div>
        </div>
      </main>
    </div>
  )
}
