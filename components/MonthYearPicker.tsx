"use client";

import { useMemo } from "react";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Props = {
  year: number;
  month: number; // 0–11
  onChange: (year: number, month: number) => void;
  className?: string;
  label?: string;
};

export default function MonthYearPicker({ year, month, onChange, className, label }: Props) {
  const { t, locale } = useTranslation();
  const now = new Date();
  const years = useMemo(() => {
    const current = now.getFullYear();
    const list: number[] = [];
    for (let y = current + 1; y >= current - 8; y--) list.push(y);
    return list;
  }, [now]);

  const monthLabels = useMemo(() => {
    const loc = locale === "pt-BR" ? "pt-BR" : locale === "es-ES" ? "es-ES" : "en-US";
    return Array.from({ length: 12 }, (_, i) =>
      new Date(Date.UTC(2020, i, 1)).toLocaleString(loc, { month: "short", timeZone: "UTC" })
        .replace(".", "")
        .replace(/^\w/, (c) => c.toUpperCase())
    );
  }, [locale]);

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">
          {label}
        </label>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(year - 1, month)}
          className="size-9 rounded-lg border border-border flex items-center justify-center text-slate-500 hover:text-primary hover:border-primary/40 transition-colors"
          aria-label={t("entry.prevYear")}
        >
          <span className="material-symbols-outlined text-[20px]">chevron_left</span>
        </button>
        <select
          value={year}
          onChange={(e) => onChange(Number(e.target.value), month)}
          className="flex-1 rounded-xl border-2 border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-[#0f172a] px-3 py-2.5 text-sm font-bold text-foreground focus:border-primary outline-none"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onChange(year + 1, month)}
          className="size-9 rounded-lg border border-border flex items-center justify-center text-slate-500 hover:text-primary hover:border-primary/40 transition-colors"
          aria-label={t("entry.nextYear")}
        >
          <span className="material-symbols-outlined text-[20px]">chevron_right</span>
        </button>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
        {monthLabels.map((name, i) => {
          const selected = i === month;
          return (
            <button
              key={name}
              type="button"
              onClick={() => onChange(year, i)}
              className={cn(
                "py-2.5 rounded-xl text-xs font-bold border-2 transition-all",
                selected
                  ? "border-primary bg-primary/10 text-primary shadow-sm"
                  : "border-transparent bg-slate-50 dark:bg-[#0f172a] text-slate-500 hover:border-border"
              )}
            >
              {name}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        {t("entry.monthStoredAsFirst", {
          month: monthLabels[month],
          year,
        })}
      </p>
    </div>
  );
}
