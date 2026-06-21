import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  groups,
  parsePriority,
  parseStrategy,
  priorities,
  type RoutingRuleField,
  type RoutingRuleFieldValue,
  strategies,
  categories,
  users,
} from "./form-data";

type RoutingRuleFormValues = {
  readonly name?: string;
  readonly match_category_id?: string | null;
  readonly match_group_id?: string | null;
  readonly match_priority?: string | null;
  readonly to_group_id?: string;
  readonly target_user_id?: string | null;
  readonly strategy?: string;
  readonly sort?: number;
  readonly active?: boolean;
};

type RoutingRuleFormFieldsProps = {
  readonly values: RoutingRuleFormValues;
  readonly isSubmitting: boolean;
  readonly submitLabel: string;
  readonly submittingLabel: string;
  readonly showRequired: boolean;
  readonly previewMatch: string;
  readonly previewTarget: string;
  readonly onChange: (field: RoutingRuleField, value: RoutingRuleFieldValue) => void;
  readonly getErrorMessage?: (field: string) => string | undefined;
};

export function RoutingRuleFormFields({
  values,
  isSubmitting,
  submitLabel,
  submittingLabel,
  showRequired,
  previewMatch,
  previewTarget,
  onChange,
  getErrorMessage,
}: RoutingRuleFormFieldsProps) {
  const errorMessage = getErrorMessage ?? (() => undefined);

  return (
    <>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">基本信息</h2>

        <div className="space-y-2">
          <label className="text-sm font-medium">
            规则名称 {showRequired ? <span className="text-red-500">*</span> : null}
          </label>
          <Input
            value={values.name ?? ""}
            onChange={(event) => onChange("name", event.target.value)}
            placeholder="请输入规则名称"
            className={errorMessage("name") ? "border-red-500" : ""}
          />
          {errorMessage("name") ? (
            <p className="text-sm text-red-500">{errorMessage("name")}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">
            规则排序 {showRequired ? <span className="text-red-500">*</span> : null}
          </label>
          <Input
            type="number"
            min={0}
            value={values.sort ?? 0}
            onChange={(event) => onChange("sort", Number.parseInt(event.target.value, 10) || 0)}
            placeholder={showRequired ? "数字越小优先级越高，默认 0" : "数字越小优先级越高"}
            className={errorMessage("sort") ? "border-red-500" : ""}
          />
          <p className="text-xs text-muted-foreground">
            数字越小优先级越高，按 sort ASC 求值，命中首条即停
          </p>
          {errorMessage("sort") ? (
            <p className="text-sm text-red-500">{errorMessage("sort")}</p>
          ) : null}
        </div>

        <div className="flex items-center space-x-2">
          <Switch checked={values.active ?? true} onCheckedChange={(checked) => onChange("active", checked)} />
          <label className="text-sm font-medium">启用规则</label>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">匹配条件</h2>
        <p className="text-sm text-muted-foreground">NULL = 通配，非 NULL 字段按 AND 组合</p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <SelectField
            label="分类"
            value={values.match_category_id ?? ""}
            onChange={(value) => onChange("match_category_id", value || null)}
            options={categories}
            emptyLabel="全部（通配）"
          />
          <SelectField
            label="技能组"
            value={values.match_group_id ?? ""}
            onChange={(value) => onChange("match_group_id", value || null)}
            options={groups}
            emptyLabel="全部（通配）"
          />
          <div className="space-y-2">
            <label className="text-sm font-medium">工单优先级</label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={values.match_priority ?? ""}
              onChange={(event) => onChange("match_priority", parsePriority(event.target.value))}
            >
              <option value="">全部（通配）</option>
              {priorities.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">分派目标</h2>
        <p className="text-sm text-muted-foreground">技能组必填，坐席可选（命中即直派）</p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SelectField
            label="目标技能组"
            required={showRequired}
            value={values.to_group_id ?? ""}
            onChange={(value) => onChange("to_group_id", value)}
            options={groups}
            emptyLabel="请选择技能组"
            error={errorMessage("to_group_id")}
          />
          <SelectField
            label="直派坐席（可选）"
            value={values.target_user_id ?? ""}
            onChange={(value) => onChange("target_user_id", value || null)}
            options={users.map((user) => ({ id: user.id, name: user.display_name }))}
            emptyLabel="不直派（按策略选坐席）"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">
            分派策略 {showRequired ? <span className="text-red-500">*</span> : null}
          </label>
          <select
            className={`flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ${
              errorMessage("strategy") ? "border-red-500" : "border-input"
            }`}
            value={values.strategy ?? "least_load"}
            onChange={(event) => onChange("strategy", parseStrategy(event.target.value))}
          >
            {strategies.map((strategy) => (
              <option key={strategy.value} value={strategy.value}>
                {strategy.label}
              </option>
            ))}
          </select>
          {errorMessage("strategy") ? (
            <p className="text-sm text-red-500">{errorMessage("strategy")}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">直派坐席时策略不生效；坐席停用时回退到策略选人</p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">条件预览</h2>
        <div className="space-y-2 rounded-md bg-muted p-4">
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

      <div className="flex justify-end gap-4 border-t pt-4">
        <Link href="/admin/routing-rules">
          <Button variant="outline" type="button">
            取消
          </Button>
        </Link>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? submittingLabel : submitLabel}
        </Button>
      </div>
    </>
  );
}

type SelectFieldProps = {
  readonly label: string;
  readonly value: string;
  readonly options: readonly { readonly id: string; readonly name: string }[];
  readonly emptyLabel: string;
  readonly required?: boolean;
  readonly error?: string;
  readonly onChange: (value: string) => void;
};

function SelectField({ label, value, options, emptyLabel, required = false, error, onChange }: SelectFieldProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </label>
      <select
        className={`flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ${
          error ? "border-red-500" : "border-input"
        }`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{emptyLabel}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
    </div>
  );
}
