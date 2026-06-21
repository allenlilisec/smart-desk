"use client";

interface TicketSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

export function TicketSearch({ value, onChange, placeholder }: TicketSearchProps) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      搜索工单
      <div className="mt-2 flex rounded-lg border border-slate-200 bg-white shadow-sm focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400"
        />
        {value.trim() && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="px-3 text-sm font-medium text-brand-700 hover:text-brand-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500"
          >
            清除
          </button>
        )}
      </div>
    </label>
  );
}
