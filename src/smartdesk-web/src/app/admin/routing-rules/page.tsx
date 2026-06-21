"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RoutingRule, Priority, Strategy } from "@/types/routing-rule";
import { getMatchConditionDisplay, getTargetDisplay, getStrategyDisplay } from "@/lib/validation";

// 模拟数据 - 实际应从 API 获取
// 基于梁栋契约 v1.0：match_priority = P1-P4，to_group_id 必填，strategy 必填
const mockRules: RoutingRule[] = [
  {
    id: "1",
    org_id: "default",
    name: "P1紧急工单自动分配",
    match_priority: "P1",
    to_group_id: "group-1",
    strategy: "least_load",
    sort: 10,
    active: true,
    created_at: "2024-01-15T08:00:00Z",
    updated_at: "2024-06-20T10:30:00Z",
  },
  {
    id: "2",
    org_id: "default",
    name: "技术支持分类规则",
    match_category_id: "cat-1",
    to_group_id: "group-2",
    target_user_id: "user-1",  // 直派坐席
    strategy: "round_robin",
    sort: 20,
    active: true,
    created_at: "2024-02-01T09:00:00Z",
    updated_at: "2024-06-18T14:20:00Z",
  },
  {
    id: "3",
    org_id: "default",
    name: "普通工单技能组分派",
    match_group_id: "group-2",
    to_group_id: "group-3",
    strategy: "least_load",
    sort: 50,
    active: false,
    created_at: "2024-03-10T11:00:00Z",
    updated_at: "2024-06-15T16:45:00Z",
  },
];

// 模拟选项数据
const categories = [
  { id: "cat-1", name: "技术支持" },
  { id: "cat-2", name: "产品咨询" },
  { id: "cat-3", name: "投诉建议" },
];

const groups = [
  { id: "group-1", name: "高级技术支持组" },
  { id: "group-2", name: "普通支持组" },
  { id: "group-3", name: "客服组" },
];

const users = [
  { id: "user-1", display_name: "张三" },
  { id: "user-2", display_name: "李四" },
  { id: "user-3", display_name: "王五" },
];

export default function RoutingRulesPage() {
  const [rules, setRules] = useState<RoutingRule[]>(mockRules);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<RoutingRule | null>(null);

  // 搜索过滤
  const filteredRules = rules.filter((rule) =>
    rule.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 切换启用状态
  const handleToggleActive = (ruleId: string) => {
    setRules((prev) =>
      prev.map((rule) =>
        rule.id === ruleId ? { ...rule, active: !rule.active } : rule
      )
    );
  };

  // 打开删除确认
  const handleDeleteClick = (rule: RoutingRule) => {
    setSelectedRule(rule);
    setDeleteDialogOpen(true);
  };

  // 确认删除（软删）
  const handleConfirmDelete = () => {
    if (selectedRule) {
      // 实际应调用 DELETE API（软删，后端写 deleted_at）
      setRules((prev) => prev.filter((r) => r.id !== selectedRule.id));
      setDeleteDialogOpen(false);
      setSelectedRule(null);
    }
  };

  // 获取优先级颜色
  const getPriorityColor = (priority?: Priority) => {
    switch (priority) {
      case "P1":
        return "text-red-600 bg-red-50";
      case "P2":
        return "text-orange-600 bg-orange-50";
      case "P3":
        return "text-blue-600 bg-blue-50";
      case "P4":
        return "text-gray-600 bg-gray-50";
      default:
        return "text-gray-600 bg-gray-50";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">路由规则管理</h1>
              <p className="text-sm text-muted-foreground mt-1">
                配置工单自动分派规则（契约 v1.0）
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="outline">返回首页</Button>
              </Link>
              <Link href="/admin/routing-rules/create">
                <Button>创建规则</Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Search Bar */}
        <div className="mb-6">
          <Input
            placeholder="搜索规则名称..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-md"
          />
        </div>

        {/* Rules Table */}
        <div className="rounded-md border">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left text-sm font-medium">规则名称</th>
                <th className="px-4 py-3 text-left text-sm font-medium">匹配条件</th>
                <th className="px-4 py-3 text-left text-sm font-medium">分派目标</th>
                <th className="px-4 py-3 text-left text-sm font-medium">排序</th>
                <th className="px-4 py-3 text-left text-sm font-medium">策略</th>
                <th className="px-4 py-3 text-left text-sm font-medium">状态</th>
                <th className="px-4 py-3 text-right text-sm font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredRules.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    暂无路由规则
                  </td>
                </tr>
              ) : (
                filteredRules.map((rule) => (
                  <tr key={rule.id} className="border-b hover:bg-muted/50">
                    <td className="px-4 py-3">
                      <div className="font-medium">{rule.name}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-muted-foreground">
                        {getMatchConditionDisplay(
                          rule.match_category_id,
                          rule.match_group_id,
                          rule.match_priority,
                          categories,
                          groups
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm">
                        {getTargetDisplay(rule.to_group_id, rule.target_user_id, groups, users)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">{rule.sort}</td>
                    <td className="px-4 py-3 text-sm">
                      {getStrategyDisplay(rule.strategy)}
                    </td>
                    <td className="px-4 py-3">
                      <Switch
                        checked={rule.active}
                        onCheckedChange={() => handleToggleActive(rule.id)}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/admin/routing-rules/${rule.id}/edit`}>
                          <Button variant="ghost" size="sm">
                            编辑
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteClick(rule)}
                        >
                          删除
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Summary */}
        <div className="mt-4 text-sm text-muted-foreground">
          共 {filteredRules.length} 条规则
        </div>
      </main>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除规则「{selectedRule?.name}」吗？此操作将软删除该规则（可通过后端恢复）。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
