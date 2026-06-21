"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { RoutingRule, RoutingRuleUpdate, Priority, Strategy } from "@/types/routing-rule";
import { validateRoutingRuleUpdate, ValidationError, getMatchConditionDisplay, getTargetDisplay } from "@/lib/validation";

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

const priorities: Priority[] = ["P1", "P2", "P3", "P4"];

const strategies: { value: Strategy; label: string }[] = [
  { value: "least_load", label: "最少负载" },
  { value: "round_robin", label: "轮询" },
];

// 模拟规则数据
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
];

export default function EditRoutingRulePage() {
  const router = useRouter();
  const params = useParams();
  const ruleId = params.id as string;
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [notFound, setNotFound] = useState(false);

  const [formData, setFormData] = useState<RoutingRuleUpdate>({});

  useEffect(() => {
    // 模拟加载数据
    const rule = mockRules.find((r) => r.id === ruleId);
    if (rule) {
      setFormData({
        name: rule.name,
        match_category_id: rule.match_category_id,
        match_group_id: rule.match_group_id,
        match_priority: rule.match_priority,
        to_group_id: rule.to_group_id,
        target_user_id: rule.target_user_id,
        strategy: rule.strategy,
        sort: rule.sort,
        active: rule.active,
      });
      setIsLoading(false);
    } else {
      setNotFound(true);
      setIsLoading(false);
    }
  }, [ruleId]);

  const handleInputChange = (field: keyof RoutingRuleUpdate, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => prev.filter((e) => e.field !== field));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 表单校验
    const validation = validateRoutingRuleUpdate(formData);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    setIsSubmitting(true);
    
    // 模拟 API 调用
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    console.log("Updating rule:", ruleId, formData);
    
    setIsSubmitting(false);
    router.push("/admin/routing-rules");
  };

  const getErrorMessage = (field: string) => {
    const error = errors.find((e) => e.field === field);
    return error?.message;
  };

  const previewMatch = getMatchConditionDisplay(
    formData.match_category_id,
    formData.match_group_id,
    formData.match_priority,
    categories,
    groups
  );

  const previewTarget = getTargetDisplay(
    formData.to_group_id || "",
    formData.target_user_id,
    groups,
    users
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">规则不存在</h1>
          <Link href="/admin/routing-rules">
            <Button>返回列表</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">编辑路由规则</h1>
              <p className="text-sm text-muted-foreground mt-1">
                修改工单自动分派规则配置（契约 v1.0）
              </p>
            </div>
            <Link href="/admin/routing-rules">
              <Button variant="outline">返回列表</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* 基本信息 */}
            <section className="space-y-4">
              <h2 className="text-lg font-semibold">基本信息</h2>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">规则名称</label>
                <Input
                  value={formData.name || ""}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  placeholder="请输入规则名称"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">规则排序</label>
                <Input
                  type="number"
                  min={0}
                  value={formData.sort || 0}
                  onChange={(e) =>
                    handleInputChange("sort", parseInt(e.target.value) || 0)
                  }
                  placeholder="数字越小优先级越高"
                />
                <p className="text-xs text-muted-foreground">
                  数字越小优先级越高，按 sort ASC 求值，命中首条即停
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  checked={formData.active ?? true}
                  onCheckedChange={(checked) =>
                    handleInputChange("active", checked)
                  }
                />
                <label className="text-sm font-medium">启用规则</label>
              </div>
            </section>

            {/* 匹配条件 */}
            <section className="space-y-4">
              <h2 className="text-lg font-semibold">匹配条件</h2>
              <p className="text-sm text-muted-foreground">
                NULL = 通配，非 NULL 字段按 AND 组合
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">分类</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={formData.match_category_id || ""}
                    onChange={(e) =>
                      handleInputChange(
                        "match_category_id",
                        e.target.value || null
                      )
                    }
                  >
                    <option value="">全部（通配）</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">技能组</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={formData.match_group_id || ""}
                    onChange={(e) =>
                      handleInputChange(
                        "match_group_id",
                        e.target.value || null
                      )
                    }
                  >
                    <option value="">全部（通配）</option>
                    {groups.map((grp) => (
                      <option key={grp.id} value={grp.id}>
                        {grp.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">工单优先级</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={formData.match_priority || ""}
                    onChange={(e) =>
                      handleInputChange(
                        "match_priority",
                        (e.target.value as Priority) || null
                      )
                    }
                  >
                    <option value="">全部（通配）</option>
                    {priorities.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            {/* 分派目标 */}
            <section className="space-y-4">
              <h2 className="text-lg font-semibold">分派目标</h2>
              <p className="text-sm text-muted-foreground">
                技能组必填，坐席可选（命中即直派）
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">目标技能组</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={formData.to_group_id || ""}
                    onChange={(e) =>
                      handleInputChange("to_group_id", e.target.value)
                    }
                  >
                    <option value="">请选择技能组</option>
                    {groups.map((grp) => (
                      <option key={grp.id} value={grp.id}>
                        {grp.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">直派坐席（可选）</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={formData.target_user_id || ""}
                    onChange={(e) =>
                      handleInputChange(
                        "target_user_id",
                        e.target.value || null
                      )
                    }
                  >
                    <option value="">不直派（按策略选坐席）</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.display_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">分派策略</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.strategy || "least_load"}
                  onChange={(e) =>
                    handleInputChange("strategy", e.target.value as Strategy)
                  }
                >
                  {strategies.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  直派坐席时策略不生效；坐席停用时回退到策略选人
                </p>
              </div>
            </section>

            {/* 条件预览 */}
            <section className="space-y-4">
              <h2 className="text-lg font-semibold">条件预览</h2>
              <div className="rounded-md bg-muted p-4 space-y-2">
                <div className="text-sm">
                  <span className="font-medium">匹配条件：</span>
                  <span className="text-muted-foreground">{previewMatch}</span>
                </div>
                <div className="text-sm">
                  <span className="font-medium">分派目标：</span>
                  <span className="text-muted-foreground">{previewTarget}</span>
                </div>
              </div>
            </section>

            {/* 操作按钮 */}
            <div className="flex justify-end gap-4 pt-4 border-t">
              <Link href="/admin/routing-rules">
                <Button variant="outline" type="button">
                  取消
                </Button>
              </Link>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "保存中..." : "保存修改"}
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
