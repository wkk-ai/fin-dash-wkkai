"use client";

import { useTranslation } from "@/lib/i18n";
import { MovementEntry } from "@/types/database";
import { useState, useEffect } from "react";

interface Props {
    movements: MovementEntry[];
    onUpdate: () => void;
}

export default function MovementsTable({ movements, onUpdate }: Props) {
    const { t, formatCurrency } = useTranslation();
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editData, setEditData] = useState<MovementEntry | null>(null);
    const [loading, setLoading] = useState(false);

    const [incomeCategories, setIncomeCategories] = useState<string[]>([]);
    const [expenseCategories, setExpenseCategories] = useState<string[]>([]);

    useEffect(() => {
        fetch("/api/settings")
            .then(res => res.json())
            .then(data => {
                setIncomeCategories(data.incomeCategories || []);
                setExpenseCategories(data.expenseCategories || []);
            })
            .catch(err => console.error(err));
    }, []);

    const handleEdit = (index: number) => {
        setEditingId(index);
        setEditData({ ...movements[index] });
    };

    const handleSave = async () => {
        if (!editData || editingId === null) return;
        setLoading(true);

        const updatedMovements = [...movements];
        updatedMovements[editingId] = editData;

        try {
            await fetch("/api/movements", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "updateMovements", data: updatedMovements }),
            });
            setEditingId(null);
            onUpdate();
        } catch (error) {
            console.error("Error updating movement:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (index: number) => {
        if (!confirm("Are you sure you want to delete this movement?")) return;
        setLoading(true);

        const updatedMovements = movements.filter((_, i) => i !== index);

        try {
            await fetch("/api/movements", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "updateMovements", data: updatedMovements }),
            });
            onUpdate();
        } catch (error) {
            console.error("Error deleting movement:", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="rounded-xl bg-surface border border-border shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
                <h3 className="text-lg font-bold text-foreground">{t("movements.history")}</h3>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead>
                        <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-border text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <th className="px-6 py-3 w-32">{t("movements.date")}</th>
                            <th className="px-6 py-3">{t("movements.descriptionTable")}</th>
                            <th className="px-6 py-3 w-48">{t("movements.category")}</th>
                            <th className="px-6 py-3 w-40 text-right">{t("movements.value")}</th>
                            <th className="px-6 py-3 w-32 text-center">{t("movements.actions")}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {movements.map((movement, index) => (
                            <tr key={index} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                                    {editingId === index ? (
                                        <input
                                            type="text"
                                            className="bg-background border border-border rounded px-2 py-1 w-full"
                                            value={editData?.Date}
                                            onChange={e => setEditData(prev => prev ? { ...prev, Date: e.target.value } : null)}
                                        />
                                    ) : (
                                        movement.Date
                                    )}
                                </td>
                                <td className="px-6 py-4 text-sm font-medium text-foreground">
                                    {editingId === index ? (
                                        <input
                                            type="text"
                                            className="bg-background border border-border rounded px-2 py-1 w-full"
                                            value={editData?.Description}
                                            onChange={e => setEditData(prev => prev ? { ...prev, Description: e.target.value } : null)}
                                        />
                                    ) : (
                                        movement.Description
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                    {editingId === index ? (
                                        <select
                                            className="bg-background border border-border rounded px-2 py-1 w-full text-xs"
                                            value={editData?.Category}
                                            onChange={e => setEditData(prev => prev ? { ...prev, Category: e.target.value } : null)}
                                        >
                                            {(editData?.Type === "Income" ? incomeCategories : expenseCategories).map(c => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                                            {movement.Category}
                                        </span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-sm font-bold text-right">
                                    {editingId === index ? (
                                        <div className="flex flex-col gap-1 items-end">
                                            <select
                                                className="bg-background border border-border rounded px-1 py-0.5 text-[10px] w-20"
                                                value={editData?.Type}
                                                onChange={e => {
                                                    const newType = e.target.value as any;
                                                    const cats = newType === "Income" ? incomeCategories : expenseCategories;
                                                    setEditData(prev => prev ? {
                                                        ...prev,
                                                        Type: newType,
                                                        Category: cats.length > 0 ? cats[0] : ""
                                                    } : null);
                                                }}
                                            >
                                                <option value="Income">{t("movements.income")}</option>
                                                <option value="Expense">{t("movements.expense")}</option>
                                            </select>
                                            <input
                                                type="number"
                                                className={`bg-background border border-border rounded px-2 py-1 w-24 text-right ${editData?.Type === "Income" ? "text-green-500" : "text-red-500"}`}
                                                value={editData?.Value}
                                                onChange={e => setEditData(prev => prev ? { ...prev, Value: Number(e.target.value) } : null)}
                                            />
                                        </div>
                                    ) : (
                                        <span className={movement.Type === "Income" ? "text-green-500" : "text-red-500"}>
                                            {`${movement.Type === "Income" ? "+" : "-"}${formatCurrency(movement.Value)}`}
                                        </span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-center">
                                    {editingId === index ? (
                                        <div className="flex justify-center gap-2">
                                            <button onClick={handleSave} disabled={loading} className="text-green-500 hover:text-green-600 transition-colors">
                                                <span className="material-symbols-outlined text-lg">check_circle</span>
                                            </button>
                                            <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-500">
                                                <span className="material-symbols-outlined text-lg">cancel</span>
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex justify-center gap-2">
                                            <button onClick={() => handleEdit(index)} className="text-primary hover:text-primary/80 transition-colors">
                                                <span className="material-symbols-outlined text-lg">edit</span>
                                            </button>
                                            <button onClick={() => handleDelete(index)} className="text-slate-400 hover:text-red-500 transition-colors">
                                                <span className="material-symbols-outlined text-lg">delete</span>
                                            </button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
