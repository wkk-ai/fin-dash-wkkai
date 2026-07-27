"use client";

import { useTranslation } from "@/lib/i18n";
import { FormattedNumberInput } from "@/components/FormattedNumberInput";
import { EmptyHint } from "./EmptyHint";
import { BudgetEntry } from "@/types/database";
import { cn } from "@/lib/utils";

interface Props {
    expenseCategories: string[];
    budgets: BudgetEntry[];
    onBudgetsChange: (budgets: BudgetEntry[]) => void;
    saving: boolean;
    onSave: () => void;
    onCopyEqualSplit: () => void;
    onClearGoals: () => void;
    onEnsureCategories: () => void;
}

export function BudgetsSection({
    expenseCategories,
    budgets,
    onBudgetsChange,
    saving,
    onSave,
    onCopyEqualSplit,
    onClearGoals,
    onEnsureCategories,
}: Props) {
    const { t, formatCurrency } = useTranslation();
    const cats = expenseCategories || [];
    const total = cats.reduce((acc, c) => {
        const b = budgets.find((x) => x.Category === c);
        return acc + (b?.Budget || 0);
    }, 0);

    if (cats.length === 0) {
        return (
            <EmptyHint
                title={t("settings.budgetEmptyTitle")}
                description={t("settings.budgetEmptyDesc")}
                actionLabel={t("settings.tabTags")}
                onAction={onEnsureCategories}
            />
        );
    }

    return (
        <div className="rounded-xl bg-surface border border-border shadow-sm p-6 flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[24px]">target</span>
                    {t("settings.spendingGoals")}
                </h3>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={onCopyEqualSplit}
                        className="text-xs font-bold px-3 py-2 rounded-lg border border-border hover:border-primary/40 text-slate-600 dark:text-slate-300"
                    >
                        {t("settings.budgetEqualSplit")}
                    </button>
                    <button
                        type="button"
                        onClick={onClearGoals}
                        className="text-xs font-bold px-3 py-2 rounded-lg border border-border hover:border-red-400/40 text-slate-600 dark:text-slate-300"
                    >
                        {t("settings.budgetClear")}
                    </button>
                </div>
            </div>

            <div className="hidden sm:grid grid-cols-12 gap-4 items-center">
                <div className="col-span-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    {t("settings.spending")}
                </div>
                <div className="col-span-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    {t("settings.goal")}
                </div>
                <div className="col-span-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    {t("settings.goalWeight")}
                </div>
            </div>

            <div className="space-y-4">
                {cats.map((cat) => {
                    const budget = budgets.find((b) => b.Category === cat)?.Budget || 0;
                    const weight = total > 0 ? (budget / total) * 100 : 0;
                    return (
                        <div
                            key={cat}
                            className="grid grid-cols-1 sm:grid-cols-12 gap-3 sm:gap-4 items-center p-3 sm:p-0 rounded-xl sm:rounded-none bg-slate-50/80 dark:bg-slate-900/30 sm:bg-transparent"
                        >
                            <div className="sm:col-span-3">
                                <span className="text-sm font-medium text-foreground">{cat}</span>
                            </div>
                            <div className="sm:col-span-3">
                                <FormattedNumberInput
                                    value={budget}
                                    onChange={(val) => {
                                        const filtered = budgets.filter((b) => b.Category !== cat);
                                        onBudgetsChange(
                                            [...filtered, { Category: cat, Budget: val }].sort((a, b) =>
                                                a.Category.localeCompare(b.Category)
                                            )
                                        );
                                    }}
                                    placeholder="0,00"
                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none font-medium"
                                    showSpinner={false}
                                />
                            </div>
                            <div className="sm:col-span-6 flex flex-col gap-1.5">
                                <span className="text-[10px] font-bold text-slate-400 uppercase">
                                    {weight.toFixed(0)}%
                                </span>
                                <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                    <div className="bg-primary h-full transition-all" style={{ width: `${weight}%` }} />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-5 bg-primary/5 border border-primary/10 rounded-xl">
                <div>
                    <span className="text-[10px] font-bold text-primary uppercase tracking-widest">
                        {t("settings.totalPlanned")}
                    </span>
                    <p className="text-2xl font-black text-foreground">{formatCurrency(total)}</p>
                </div>
                <button
                    type="button"
                    onClick={onSave}
                    disabled={saving}
                    className={cn(
                        "bg-primary hover:bg-primary/90 text-white font-bold py-3 px-8 rounded-lg shadow-lg shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-50"
                    )}
                >
                    <span className="material-symbols-outlined">save</span>
                    {t("settings.saveGoals")}
                </button>
            </div>
        </div>
    );
}
