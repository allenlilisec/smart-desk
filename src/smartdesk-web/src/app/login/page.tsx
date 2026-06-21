'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (res.ok) {
      const data = await res.json();
      localStorage.setItem('sd_access_token', data.access_token);
      localStorage.setItem('sd_token_expires', (Date.now() + data.expires_in * 1000).toString());

      // 根据用户名简单路由
      if (username === 'zhangsan') {
        router.push('/portal');
      } else if (username === 'lisi') {
        router.push('/agent');
      } else {
        router.push('/admin/routing-rules');
      }
    } else {
      setError('用户名或密码错误');
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded border border-gray-200 bg-white p-8 shadow"
      >
        <h1 className="mb-6 text-center text-2xl font-bold">登录</h1>

        {error && (
          <div className="mb-4 rounded bg-red-50 p-3 text-center text-red-600">{error}</div>
        )}

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium">用户名</label>
          <input
            data-testid="login-username"
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2"
            required
          />
        </div>

        <div className="mb-6">
          <label className="mb-1 block text-sm font-medium">密码</label>
          <input
            data-testid="login-password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2"
            required
          />
        </div>

        <button
          data-testid="login-submit"
          type="submit"
          className="w-full rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          登录
        </button>
      </form>
    </main>
  );
}
