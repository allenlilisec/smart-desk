export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold mb-4">SmartDesk</h1>
      <p className="text-lg text-muted-foreground">
        智能客服平台前端
      </p>
      <div className="mt-8">
        <a
          href="/admin/routing-rules"
          className="text-primary hover:underline"
        >
          进入路由规则管理 →
        </a>
      </div>
    </main>
  );
}
