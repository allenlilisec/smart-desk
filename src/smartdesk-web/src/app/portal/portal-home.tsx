'use client';

import Link from 'next/link';

export default function PortalHome() {
  return (
    <main className="min-h-screen p-8">
      <header data-testid="portal-header" className="mb-6">
        <h1 className="text-2xl font-bold">报单人门户</h1>
      </header>

      <div className="flex gap-4">
        <Link
          href="/portal/tickets/new"
          data-testid="create-ticket-button"
          className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          新建工单
        </Link>
        <Link
          href="/portal/tickets"
          className="rounded border border-gray-300 px-4 py-2 hover:bg-gray-50"
        >
          我的工单
        </Link>
      </div>
    </main>
  );
}
