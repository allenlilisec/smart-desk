'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CreateTicket() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('P2');
  const [categoryId, setCategoryId] = useState('category-access-001');
  const [errors, setErrors] = useState<{ title?: string; description?: string; form?: string }>({});

  const validate = () => {
    const nextErrors: typeof errors = {};
    if (!title.trim()) nextErrors.title = '标题不能为空';
    if (!description.trim()) nextErrors.description = '描述不能为空';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    if (!validate()) {
      return;
    }

    const res = await fetch('/api/v1/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, priority, categoryId }),
    });

    if (res.ok) {
      const data = await res.json();
      router.push(`/portal/tickets/${data.id}`);
    } else {
      setErrors({ form: '提交失败，请重试' });
    }
  };

  return (
    <main className="min-h-screen p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">新建工单</h1>
      </header>

      <form
        data-testid="ticket-form"
        onSubmit={handleSubmit}
        className="max-w-2xl rounded border border-gray-200 bg-white p-6 shadow"
        noValidate
      >
        {errors.form && (
          <div data-testid="form-error" className="mb-4 rounded bg-red-50 p-3 text-red-600">
            {errors.form}
          </div>
        )}

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium">标题</label>
          <input
            data-testid="ticket-title-input"
            name="title"
            type="text"
            value={title}
            onChange={e => {
              setTitle(e.target.value);
              if (errors.title) setErrors(prev => ({ ...prev, title: undefined }));
            }}
            className={`w-full rounded border px-3 py-2 ${errors.title ? 'border-red-500' : 'border-gray-300'}`}
          />
          {errors.title && (
            <div data-testid="title-error" className="mt-1 text-sm text-red-600">
              {errors.title}
            </div>
          )}
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium">描述</label>
          <textarea
            data-testid="ticket-description-input"
            name="description"
            value={description}
            onChange={e => {
              setDescription(e.target.value);
              if (errors.description) setErrors(prev => ({ ...prev, description: undefined }));
            }}
            className={`w-full rounded border px-3 py-2 ${errors.description ? 'border-red-500' : 'border-gray-300'}`}
            rows={5}
          />
          {errors.description && (
            <div data-testid="description-error" className="mt-1 text-sm text-red-600">
              {errors.description}
            </div>
          )}
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium">分类</label>
          <select
            data-testid="ticket-category-select"
            name="category"
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2"
          >
            <option value="category-access-001">访问权限</option>
            <option value="category-prod-001">生产故障</option>
            <option value="category-ui-001">界面问题</option>
          </select>
        </div>

        <div className="mb-6">
          <label className="mb-1 block text-sm font-medium">优先级</label>
          <select
            data-testid="ticket-priority-select"
            name="priority"
            value={priority}
            onChange={e => setPriority(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2"
          >
            <option value="P1">P1 - 紧急</option>
            <option value="P2">P2 - 高</option>
            <option value="P3">P3 - 中</option>
            <option value="P4">P4 - 低</option>
          </select>
        </div>

        <div className="flex gap-4">
          <button
            data-testid="submit-ticket-button"
            type="submit"
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            提交
          </button>
          <button
            data-testid="cancel-button"
            type="button"
            onClick={() => router.push('/portal/tickets')}
            className="rounded border border-gray-300 px-4 py-2 hover:bg-gray-50"
          >
            取消
          </button>
        </div>
      </form>
    </main>
  );
}
