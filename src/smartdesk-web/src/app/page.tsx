import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold">SmartDesk</h1>
      <p className="text-gray-600">智能工单平台</p>
      <div className="flex gap-4">
        <Link href="/portal" className="text-blue-600 hover:underline">
          报单人门户
        </Link>
        <Link href="/agent" className="text-blue-600 hover:underline">
          坐席工作台
        </Link>
        <Link href="/admin/routing-rules" className="text-blue-600 hover:underline">
          管理后台
        </Link>
      </div>
    </main>
  );
}
