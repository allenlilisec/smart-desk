import { RoleGuard } from "@/components/RoleGuard";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard
      requiredRole="manager"
      fallback={<div className="flex min-h-screen items-center justify-center p-8 text-center">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">无权访问</h1>
          <p className="mt-2 text-slate-500">您没有权限访问数据看板</p>
        </div>
      </div>}
    >
      {children}
    </RoleGuard>
  );
}
