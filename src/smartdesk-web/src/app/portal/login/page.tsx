'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function PortalLogin() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      // 模拟登录 API 调用
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      if (!response.ok) {
        throw new Error('登录失败')
      }

      const data = await response.json()
      
      // 保存 token
      localStorage.setItem('auth_token', data.token)
      localStorage.setItem('user_role', data.user.role)
      localStorage.setItem('user_name', data.user.name)

      // 跳转到门户首页
      router.push('/portal')
    } catch {
      setError('用户名或密码错误')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-6 text-gray-900">
          报单人登录
        </h1>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label
              htmlFor="username"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              用户名
            </label>
            <input
              id="username"
              type="text"
              data-testid="username-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div className="mb-6">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              密码
            </label>
            <input
              id="password"
              type="password"
              data-testid="password-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <button
            type="submit"
            data-testid="login-button"
            disabled={isLoading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:bg-blue-400 transition"
          >
            {isLoading ? '登录中...' : '登录'}
          </button>
        </form>
      </div>
    </div>
  )
}
