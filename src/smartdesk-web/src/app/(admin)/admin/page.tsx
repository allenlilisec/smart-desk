"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LoadingSpinner } from "@/components/ui";
import { api } from "@/lib/api";
import type { Category, SlaPolicy, User, NotificationPolicy } from "@/lib/types";

// Tab type definition
type AdminTab = "users" | "categories" | "sla" | "notifications";

const TABS = [
  { key: "users" as AdminTab, label: "用户管理" },
  { key: "categories" as AdminTab, label: "分类管理" },
  { key: "sla" as AdminTab, label: "SLA 策略" },
  { key: "notifications" as AdminTab, label: "通知策略" },
];

// Role labels for display
const ROLE_LABELS: Record<string, string> = {
  requester: "提单人",
  agent: "坐席",
  lead: "组长",
  manager: "经理",
  admin: "管理员",
};

// Status labels for display
const STATUS_LABELS: Record<string, string> = {
  active: "活跃",
  disabled: "禁用",
};

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>("users");
  const [loading, setLoading] = useState(false);

  // Data states
  const [users, setUsers] = useState<User[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [slaPolicies, setSlaPolicies] = useState<SlaPolicy[]>([]);
  const [notificationPolicies, setNotificationPolicies] = useState<NotificationPolicy[]>([]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        switch (activeTab) {
          case "users":
            const userPage = await api.listUsers({ page: 1, page_size: 50 });
            setUsers(userPage.items);
            break;
          case "categories":
            setCategories(await api.listCategories());
            break;
          case "sla":
            setSlaPolicies(await api.listSlaPolicies());
            break;
          case "notifications":
            setNotificationPolicies(await api.listNotificationPolicies());
            break;
        }
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [activeTab]);

  const renderUsersTable = () => (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
              用户名
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
              显示名称
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
              邮箱
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
              角色
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
              状态
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {users.map((user) => (
            <tr key={user.id} className="hover:bg-slate-50">
              <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900">
                {user.username}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-700">
                {user.display_name}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500">
                {user.email}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-700">
                <div className="flex flex-wrap gap-1">
                  {user.roles.map((role) => (
                    <span
                      key={role}
                      className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 ring-1 ring-slate-200"
                    >
                      {ROLE_LABELS[role] || role}
                    </span>
                  ))}
                </div>
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    user.status === "active"
                      ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200"
                      : "bg-slate-100 text-slate-700 ring-1 ring-slate-200"
                  }`}
                >
                  {STATUS_LABELS[user.status]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderCategoriesTable = () => (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
              名称
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
              编码
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
              上级分类
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
              排序
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
              状态
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {categories.map((cat) => (
            <tr key={cat.id} className="hover:bg-slate-50">
              <td className="px-6 py-4 text-sm font-medium text-slate-900">
                <div className={cat.parent_id ? "ml-4" : ""}>
                  {cat.name}
                </div>
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500 font-mono">
                {cat.code}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500">
                {cat.parent_id
                  ? categories.find((c) => c.id === cat.parent_id)?.name || "-"
                  : "-"}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-700">
                {cat.sort}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    cat.active
                      ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200"
                      : "bg-slate-100 text-slate-700 ring-1 ring-slate-200"
                  }`}
                >
                  {cat.active ? "启用" : "禁用"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderSlaTable = () => (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
              策略名称
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
              状态
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
              目标配置
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {slaPolicies.map((sla) => (
            <tr key={sla.id} className="hover:bg-slate-50">
              <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900">
                {sla.name}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    sla.active
                      ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200"
                      : "bg-slate-100 text-slate-700 ring-1 ring-slate-200"
                  }`}
                >
                  {sla.active ? "启用" : "禁用"}
                </span>
              </td>
              <td className="px-6 py-4 text-sm text-slate-700">
                <div className="space-y-1">
                  {sla.targets.map((target) => (
                    <div key={target.priority} className="flex items-center gap-4 text-xs">
                      <span className="font-medium">{target.priority}</span>
                      <span className="text-slate-500">
                        响应 {target.response_minutes}分钟 / 解决 {target.resolve_minutes}分钟
                      </span>
                    </div>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderNotificationsTable = () => (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
              角色
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
              事件类型
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
              渠道
            </th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
              状态
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {notificationPolicies.map((policy, index) => (
            <tr key={index} className="hover:bg-slate-50">
              <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900">
                {ROLE_LABELS[policy.role] || policy.role}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-700 font-mono">
                {policy.event_type}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-700">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    policy.channel === "email"
                      ? "bg-blue-100 text-blue-800 ring-1 ring-blue-200"
                      : "bg-purple-100 text-purple-800 ring-1 ring-purple-200"
                  }`}
                >
                  {policy.channel === "email" ? "邮件" : "站内"}
                </span>
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    policy.enabled
                      ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200"
                      : "bg-slate-100 text-slate-700 ring-1 ring-slate-200"
                  }`}
                >
                  {policy.enabled ? "启用" : "禁用"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderContent = () => {
    if (loading) return <LoadingSpinner />;

    switch (activeTab) {
      case "users":
        return renderUsersTable();
      case "categories":
        return renderCategoriesTable();
      case "sla":
        return renderSlaTable();
      case "notifications":
        return renderNotificationsTable();
      default:
        return null;
    }
  };

  return (
    <AppShell title="管理后台">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Page description */}
        <div className="mb-6">
          <p className="text-sm text-slate-500">
            管理后台（P0 只读壳层）—— 搜索、过滤、编辑功能为增量项，不阻塞 P0 框架
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-slate-200">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`
                  whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors
                  ${
                    activeTab === tab.key
                      ? "border-brand-500 text-brand-600"
                      : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
                  }
                `}
                aria-current={activeTab === tab.key ? "page" : undefined}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="min-h-[400px]">{renderContent()}</div>
      </div>
    </AppShell>
  );
}
