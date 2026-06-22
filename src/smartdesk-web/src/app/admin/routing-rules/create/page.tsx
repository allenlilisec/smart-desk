"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { RoutingRuleCreate } from "@/types/routing-rule";
import { validateRoutingRuleCreate, ValidationError, getMatchConditionDisplay, getTargetDisplay } from "@/lib/validation";
import { RoutingRuleFormFields } from "../routing-rule-form-fields";
import { categories, groups, users, type RoutingRuleField, type RoutingRuleFieldValue } from "../form-data";

export default function CreateRoutingRulePage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<ValidationError[]>([]);

  // 基于契约 v1.0：to_group_id 必填，strategy 必填，sort 默认 0
  const [formData, setFormData] = useState<RoutingRuleCreate>({
    name: "",
    match_category_id: null,
    match_group_id: null,
    match_priority: null,
    to_group_id: "",           // 必填
    target_user_id: null,       // 可选
    strategy: "least_load",    // 必填，默认
    sort: 0,                   // 必填，默认
    active: true,              // 默认
  });

  const handleInputChange = (field: RoutingRuleField, value: RoutingRuleFieldValue) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // 清除对应字段的错误
    setErrors((prev) => prev.filter((e) => e.field !== field));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 表单校验
    const validation = validateRoutingRuleCreate(formData);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    setIsSubmitting(true);
    
    // 模拟 API 调用
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    console.log("Creating rule:", formData);
    
    setIsSubmitting(false);
    router.push("/admin/routing-rules");
  };

  const getErrorMessage = (field: string) => {
    const error = errors.find((e) => e.field === field);
    return error?.message;
  };

  // 生成条件预览
  const previewMatch = getMatchConditionDisplay(
    formData.match_category_id,
    formData.match_group_id,
    formData.match_priority,
    categories,
    groups
  );

  const previewTarget = getTargetDisplay(
    formData.to_group_id,
    formData.target_user_id,
    groups,
    users
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">创建路由规则</h1>
              <p className="text-sm text-muted-foreground mt-1">
                配置新的工单自动分派规则（契约 v1.0）
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
            <RoutingRuleFormFields
              values={formData}
              isSubmitting={isSubmitting}
              submitLabel="创建规则"
              submittingLabel="创建中..."
              showRequired
              previewMatch={previewMatch}
              previewTarget={previewTarget}
              onChange={handleInputChange}
              getErrorMessage={getErrorMessage}
            />
          </form>
        </div>
      </main>
    </div>
  );
}
