"use client";

import { useState, useEffect } from "react";
import { MovementEntry } from "@/types/database";
import { useTranslation } from "@/lib/i18n";
import { FormattedNumberInput } from "@/components/FormattedNumberInput";

import Portal from "./Portal";

interface Props {
    onClose: () => void;
}

export const DEFAULT_CATEGORIES = [
    "Salário",
    "Investimentos",
    "Moradia",
    "Alimentação",
    "Transporte",
    "Lazer",
    "Educação",
    "Saúde",
    "Outros"
];

export default function AddMovementModal({ onClose }: Props) {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [incomeCategories, setIncomeCategories] = useState<string[]>([]);
    const [expenseCategories, setExpenseCategories] = useState<string[]>([]);
    const [loadingCategories, setLoadingCategories] = useState(true);

    const [data, setData] = useState<MovementEntry>({
        Date: new Date().toISOString().split("T")[0],
        Description: "",
        Category: "",
        Type: "Expense",
        Value: 0
    });

    useEffect(() => {
        fetch("/api/settings")
            .then(res => res.json())
            .then(settings => {
                setIncomeCategories(settings.incomeCategories || []);
                setExpenseCategories(settings.expenseCategories || []);
                setLoadingCategories(false);

                // Set initial category
                const initialCats = data.Type === "Income" ? settings.incomeCategories : settings.expenseCategories;
                if (initialCats?.length > 0) {
                    setData(prev => ({ ...prev, Category: initialCats[0] }));
                }
            })
            .catch(err => {
                console.error("Failed to load categories", err);
                setLoadingCategories(false);
            });
    }, []);

    // When type changes, reset category to first available for that type
    useEffect(() => {
        const cats = data.Type === "Income" ? incomeCategories : expenseCategories;
        if (cats.length > 0 && !cats.includes(data.Category)) {
            setData(prev => ({ ...prev, Category: cats[0] }));
        }
    }, [data.Type, incomeCategories, expenseCategories]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        // Format date to DD/MMM/YY for consistency with the rest of the app's DB
        const dateObj = new Date(data.Date);
        const day = String(dateObj.getUTCDate()).padStart(2, "0");
        const month = dateObj.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
        const year = String(dateObj.getUTCFullYear()).slice(-2);
        const dbDate = `${day}/${month}/${year}`;

        try {
            const res = await fetch("/api/movements", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "append",
                    data: { ...data, Date: dbDate }
                }),
            });

            if (res.ok) {
                window.dispatchEvent(new CustomEvent("show-success-toast", {
                    detail: { message: t("toast.assetAddedSuccess") } // Reuse existing success key
                }));
                window.dispatchEvent(new CustomEvent("movement-added"));
                onClose();
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Portal>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
                <div className="bg-surface border border-border rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                    <div className="px-6 py-4 border-b border-border flex justify-between items-center">
                        <h3 className="text-lg font-bold text-foreground">{t("movements.addMovement")}</h3>
                        <button
                            onClick={onClose}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                        >
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="p-6 space-y-4">
                        <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                            <button
                                type="button"
                                onClick={() => setData({ ...data, Type: "Income" })}
                                className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${data.Type === "Income" ? "bg-white dark:bg-slate-700 text-green-600 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
                            >
                                {t("movements.income")}
                            </button>
                            <button
                                type="button"
                                onClick={() => setData({ ...data, Type: "Expense" })}
                                className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${data.Type === "Expense" ? "bg-white dark:bg-slate-700 text-red-500 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}
                            >
                                {t("movements.expense")}
                            </button>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1">{t("movements.date")}</label>
                            <input
                                type="date"
                                required
                                value={data.Date}
                                onChange={e => setData({ ...data, Date: e.target.value })}
                                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1">{t("movements.descriptionTable")}</label>
                            <input
                                type="text"
                                required
                                placeholder="Ex: Aluguel, Supermercado..."
                                value={data.Description}
                                onChange={e => setData({ ...data, Description: e.target.value })}
                                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1">{t("movements.category")}</label>
                            <select
                                required
                                value={data.Category}
                                onChange={e => setData({ ...data, Category: e.target.value })}
                                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                disabled={loadingCategories}
                            >
                                {(data.Type === "Income" ? incomeCategories : expenseCategories).map(c => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1">{t("movements.value")}</label>
                            <FormattedNumberInput
                                value={data.Value}
                                onChange={n => setData({ ...data, Value: n })}
                                required
                                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary font-bold"
                            />
                        </div>

                        <div className="pt-4 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                            >
                                {t("common.cancel")}
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className={`rounded-lg px-6 py-2 text-sm font-bold text-white shadow-md transition-all cursor-pointer disabled:opacity-50 ${data.Type === "Income" ? "bg-green-600 hover:bg-green-700 shadow-green-600/20" : "bg-red-600 hover:bg-red-700 shadow-red-600/20"}`}
                            >
                                {loading ? t("addAsset.saving") : t("movements.save")}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </Portal>
    );
}
