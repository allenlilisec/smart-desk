"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { RoutingRuleUpdate } from "@/types/routing-rule";
import { validateRoutingRuleUpdate, ValidationError, getMatchConditionDisplay, getTargetDisplay } from "@/lib/validation";
import { RoutingRuleFormFields } from "../../routing-rule-form-fields";
import { categories, groups, mockRules, users, type RoutingRuleField, type RoutingRuleFieldValue } from "../../form-data";

export default function EditRoutingRulePage() {
  const router = useRouter();
  const params = useParams();
  const ruleId = params.id as string;
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [, setErrors] = useState<ValidationError[]>([]);
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

  const handleInputChange = (field: RoutingRuleField, value: RoutingRuleFieldValue) => {
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
            <RoutingRuleFormFields
              values={formData}
              isSubmitting={isSubmitting}
              submitLabel="保存修改"
              submittingLabel="保存中..."
              showRequired={false}
              previewMatch={previewMatch}
              previewTarget={previewTarget}
              onChange={handleInputChange}
            />
          </form>
        </div>
      </main>
    </div>
  );
}
