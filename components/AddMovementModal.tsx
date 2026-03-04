"use client";

import { useState, useEffect } from "react";
import { MovementEntry } from "@/types/database";
import { useTranslation } from "@/lib/i18n";
import { FormattedNumberInput } from "@/components/FormattedNumberInput";
import { CustomCombobox } from "@/components/CustomCombobox";

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
    const [activeTab, setActiveTab] = useState<"single" | "multiple">("single");
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

    const [multipleData, setMultipleData] = useState<{ id: string; Date: string; Description: string; Category: string; Value: number }[]>([
        { id: Math.random().toString(36).substr(2, 9), Date: new Date().toISOString().split("T")[0], Description: "", Category: "", Value: 0 }
    ]);

    useEffect(() => {
        fetch("/api/settings")
            .then(res => res.json())
            .then(settings => {
                const incCats = settings.incomeCategories || [];
                const expCats = settings.expenseCategories || [];
                setIncomeCategories(incCats);
                setExpenseCategories(expCats);
                setLoadingCategories(false);

                // Set initial category for single
                const initialCats = data.Type === "Income" ? incCats : expCats;
                if (initialCats?.length > 0) {
                    setData(prev => ({ ...prev, Category: initialCats[0] }));
                    setMultipleData(prev => prev.map(row => ({ ...row, Category: initialCats[0] })));
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
        setMultipleData(prev => prev.map(row => {
            if (cats.length > 0 && !cats.includes(row.Category)) {
                return { ...row, Category: cats[0] };
            }
            return row;
        }));
    }, [data.Type, incomeCategories, expenseCategories]);

    const formatDBDate = (dateStr: string) => {
        const dateObj = new Date(dateStr);
        const day = String(dateObj.getUTCDate()).padStart(2, "0");
        const month = dateObj.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
        const year = String(dateObj.getUTCFullYear()).slice(-2);
        return `${day}/${month}/${year}`;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const itemsToSave = activeTab === "single"
            ? [{ ...data, Date: formatDBDate(data.Date) }]
            : multipleData
                .filter(row => row.Description.trim() !== "" && row.Value !== 0)
                .map(row => ({
                    Date: formatDBDate(row.Date),
                    Description: row.Description,
                    Category: row.Category,
                    Type: data.Type,
                    Value: row.Value
                }));

        if (itemsToSave.length === 0) {
            setLoading(false);
            return;
        }

        try {
            for (const item of itemsToSave) {
                await fetch("/api/movements", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action: "append",
                        data: item
                    }),
                });
            }

            window.dispatchEvent(new CustomEvent("show-success-toast", {
                detail: { message: t("toast.assetAddedSuccess") }
            }));
            window.dispatchEvent(new CustomEvent("movement-added"));
            onClose();
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const addRow = () => {
        const cats = data.Type === "Income" ? incomeCategories : expenseCategories;
        setMultipleData([...multipleData, {
            id: Math.random().toString(36).substr(2, 9),
            Date: new Date().toISOString().split("T")[0],
            Description: "",
            Category: cats[0] || "",
            Value: 0
        }]);
    };

    const removeRow = (id: string) => {
        if (multipleData.length > 1) {
            setMultipleData(multipleData.filter(r => r.id !== id));
        }
    };

    const updateRow = (id: string, field: string, value: any) => {
        setMultipleData(multipleData.map(r => r.id === id ? { ...r, [field]: value } : r));
    };

    const activeColorClass = data.Type === "Income" ? "text-green-600 border-green-600" : "text-red-500 border-red-500";
    const activeBgClass = data.Type === "Income" ? "bg-green-600 hover:bg-green-700 shadow-green-600/20" : "bg-red-500 hover:bg-red-600 shadow-red-500/20";

    return (
        <Portal>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
                <div className={`bg-surface border border-border rounded-xl shadow-xl w-full ${activeTab === "single" ? "max-w-md" : "max-w-4xl"} overflow-hidden animate-in fade-in zoom-in-95 duration-200`}>
                    <div className="px-6 py-4 border-b border-border flex justify-between items-center">
                        <h3 className="text-lg font-bold text-foreground">{t("movements.addMovement")}</h3>
                        <button
                            onClick={onClose}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                        >
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>

                    <div className="px-6 pt-6">
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
                    </div>

                    <div className="px-6 mt-4 border-b border-border flex gap-8">
                        <button
                            onClick={() => setActiveTab("single")}
                            className={`pb-3 text-sm font-bold transition-all border-b-2 ${activeTab === "single" ? activeColorClass : "text-slate-500 border-transparent hover:text-slate-700 dark:hover:text-slate-300"}`}
                        >
                            {t("movements.singleTab")}
                        </button>
                        <button
                            onClick={() => setActiveTab("multiple")}
                            className={`pb-3 text-sm font-bold transition-all border-b-2 ${activeTab === "multiple" ? activeColorClass : "text-slate-500 border-transparent hover:text-slate-700 dark:hover:text-slate-300"}`}
                        >
                            {t("movements.multipleTab")}
                        </button>
                    </div>

                    {activeTab === "single" ? (
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
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
                                <CustomCombobox
                                    options={data.Type === "Income" ? incomeCategories : expenseCategories}
                                    required
                                    placeholder="Adicionar ou escolher..."
                                    value={data.Category}
                                    onChange={val => setData({ ...data, Category: val })}
                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                    disabled={loadingCategories}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-foreground mb-1">{t("movements.value")}</label>
                                <FormattedNumberInput
                                    value={data.Type === "Income" ? (data.Value > 0 ? data.Value : 0) : (data.Value > 0 ? data.Value : 0)}
                                    onChange={n => setData({ ...data, Value: n })}
                                    required
                                    placeholder="Ex: 0,00"
                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary font-bold"
                                />
                            </div>

                            <div className="pt-4 flex justify-end gap-3">
                                <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer">
                                    {t("common.cancel")}
                                </button>
                                <button type="submit" disabled={loading} className={`rounded-lg px-8 py-2 text-sm font-bold text-white shadow-md transition-all cursor-pointer disabled:opacity-50 ${activeBgClass}`}>
                                    {loading ? t("addAsset.saving") : t("movements.save")}
                                </button>
                            </div>
                        </form>
                    ) : (
                        <form onSubmit={handleSubmit} className="p-6">
                            <div className="overflow-x-auto max-h-[400px] mb-4">
                                <table className="w-full text-left min-w-[800px]">
                                    <thead>
                                        <tr className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                            <th className="pb-3 pr-4 w-1/5">{t("movements.date")}</th>
                                            <th className="pb-3 pr-4 w-1/3">{t("movements.descriptionTable")}</th>
                                            <th className="pb-3 pr-4 w-1/4">{t("movements.category")}</th>
                                            <th className="pb-3 pr-4 w-1/5 text-right">{t("movements.value")} (R$)</th>
                                            <th className="pb-3 w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {multipleData.map((row) => (
                                            <tr key={row.id}>
                                                <td className="py-2 pr-4">
                                                    <input
                                                        type="date"
                                                        value={row.Date}
                                                        onChange={e => updateRow(row.id, "Date", e.target.value)}
                                                        className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none transition-all"
                                                    />
                                                </td>
                                                <td className="py-2 pr-4">
                                                    <input
                                                        type="text"
                                                        placeholder="Ex: Aluguel"
                                                        value={row.Description}
                                                        onChange={e => updateRow(row.id, "Description", e.target.value)}
                                                        className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none transition-all"
                                                    />
                                                </td>
                                                <td className="py-2 pr-4">
                                                    <CustomCombobox
                                                        options={data.Type === "Income" ? incomeCategories : expenseCategories}
                                                        placeholder="Adicionar ou escolher..."
                                                        value={row.Category}
                                                        onChange={val => updateRow(row.id, "Category", val)}
                                                        className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none transition-all"
                                                    />
                                                </td>
                                                <td className="py-2 pr-4">
                                                    <FormattedNumberInput
                                                        value={row.Value}
                                                        onChange={n => updateRow(row.id, "Value", n)}
                                                        placeholder="Ex: 0,00"
                                                        className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none transition-all font-medium"
                                                    />
                                                </td>
                                                <td className="py-2 text-right">
                                                    <button type="button" onClick={() => removeRow(row.id)} className="text-slate-400 hover:text-red-500 transition-colors">
                                                        <span className="material-symbols-outlined text-lg">delete</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <button
                                type="button"
                                onClick={addRow}
                                className={`flex items-center gap-2 font-bold text-sm transition-colors mb-8 ${data.Type === "Income" ? "text-green-600" : "text-red-500"}`}
                            >
                                <span className="material-symbols-outlined text-[18px]">add_circle</span>
                                {t("movements.addNewLine")}
                            </button>
                            <div className="pt-4 flex justify-end gap-3 border-t border-border">
                                <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors">
                                    {t("common.cancel")}
                                </button>
                                <button type="submit" disabled={loading} className={`rounded-lg px-10 py-2.5 text-sm font-bold text-white shadow-md transition-all cursor-pointer disabled:opacity-50 ${activeBgClass}`}>
                                    {loading ? t("addAsset.saving") : t("movements.save")}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </Portal>
    );
}
