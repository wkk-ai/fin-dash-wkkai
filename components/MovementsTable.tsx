"use client";

import { useState, useEffect, useRef } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { useTranslation } from "@/lib/i18n";
import { MovementEntry } from "@/types/database";
import { ConfirmModal } from "./ConfirmModal";
import { DataReviewModal, ProcessedRow } from "./DataReviewModal";
import { fetchSettings as fetchSettingsData, replaceMovements } from "@/lib/supabase-data";

interface Props {
    movements: MovementEntry[];
    onUpdate: () => void;
    selectedCategories: string[];
    onFilterChange: (categories: string[]) => void;
}

type SortKey = "Date" | "Description" | "Category" | "Value";
type SortDirection = "asc" | "desc";

export default function MovementsTable({ movements, onUpdate, selectedCategories, onFilterChange }: Props) {
    const { t, formatCurrency } = useTranslation();
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editData, setEditData] = useState<MovementEntry | null>(null);
    const [loading, setLoading] = useState(false);
    const [isDownloadOpen, setIsDownloadOpen] = useState(false);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
        key: "Date",
        direction: "desc",
    });
    const filterRef = useRef<HTMLDivElement>(null);
    const [modalConfig, setModalConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        confirmLabel?: string;
        onConfirm: () => void;
        variant?: "primary" | "danger";
    }>({
        isOpen: false,
        title: "",
        message: "",
        onConfirm: () => { },
    });


    const [incomeCategories, setIncomeCategories] = useState<string[]>([]);
    const [expenseCategories, setExpenseCategories] = useState<string[]>([]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
                setIsFilterOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const parseCustomDate = (dateStr: string) => {
        if (!dateStr) return new Date();
        const parts = dateStr.split('/');
        if (parts.length < 3) return new Date();
        const day = parseInt(parts[0], 10);
        const monthStr = parts[1];
        const year = parseInt(`20${parts[2]}`, 10);
        const months: Record<string, number> = {
            Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
        };
        return new Date(year, months[monthStr], day);
    };

    const csvDateToInputDate = (csvDate: string): string => {
        const d = parseCustomDate(csvDate);
        if (Number.isNaN(d.getTime())) return "";
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    };

    const inputDateToCsvDate = (inputDate: string): string => {
        if (!inputDate) return "";
        const d = new Date(`${inputDate}T00:00:00`);
        if (Number.isNaN(d.getTime())) return "";
        const day = String(d.getDate()).padStart(2, "0");
        const month = d.toLocaleString("en-US", { month: "short" });
        const year = String(d.getFullYear()).slice(-2);
        return `${day}/${month}/${year}`;
    };

    useEffect(() => {
        fetchSettingsData()
            .then(data => {
                setIncomeCategories(data.incomeCategories || []);
                setExpenseCategories(data.expenseCategories || []);
            })
            .catch(err => console.error(err));
    }, []);

    const handleSort = (key: SortKey) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc",
        }));
    };

    const handleFilterToggle = (category: string) => {
        if (selectedCategories.includes(category)) {
            onFilterChange(selectedCategories.filter(c => c !== category));
        } else {
            onFilterChange([...selectedCategories, category]);
        }
    };

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
            await replaceMovements(updatedMovements);
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
            await replaceMovements(updatedMovements);
            onUpdate();
        } catch (error) {
            console.error("Error deleting movement:", error);
        } finally {
            setLoading(false);
        }
    };



    const allCategories = Array.from(new Set(movements.map(m => m.Category))).sort();

    const sortedMovements = [...movements]
        .map((m, originalIndex) => ({ ...m, originalIndex }))
        .filter(m => selectedCategories.length === 0 || selectedCategories.includes(m.Category))
        .sort((a, b) => {
            let result = 0;
            switch (sortConfig.key) {
                case "Date":
                    result = parseCustomDate(a.Date).getTime() - parseCustomDate(b.Date).getTime();
                    break;
                case "Description":
                    result = a.Description.localeCompare(b.Description);
                    break;
                case "Category":
                    result = a.Category.localeCompare(b.Category);
                    break;
                case "Value":
                    result = a.Value - b.Value;
                    break;
            }
            return sortConfig.direction === "asc" ? result : -result;
        });

    const downloadFile = (type: "csv" | "xlsx") => {
        setIsDownloadOpen(false);
        const dataToExport = sortedMovements.map(({ originalIndex, ...rest }) => rest);

        if (type === "csv") {
            const csv = Papa.unparse(dataToExport);
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.setAttribute("download", `movements-${new Date().toISOString().slice(0, 10)}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else {
            const worksheet = XLSX.utils.json_to_sheet(dataToExport);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Movements");
            XLSX.writeFile(workbook, `movements-${new Date().toISOString().slice(0, 10)}.xlsx`);
        }
    };

    const renderSortIcon = (key: SortKey) => {
        if (sortConfig.key !== key) return <span className="material-symbols-outlined text-[14px] opacity-20 group-hover:opacity-100">unfold_more</span>;
        return (
            <span className="material-symbols-outlined text-[14px] text-primary">
                {sortConfig.direction === "asc" ? "expand_less" : "expand_more"}
            </span>
        );
    };

    return (
        <div className="bg-surface border border-border/60 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.07)] rounded-xl overflow-hidden">
            <div className="px-6 py-5 border-b border-border/40 flex justify-between items-center bg-background/30 backdrop-blur-sm">
                <h3 className="text-base font-bold text-foreground tracking-tight">{t("movements.history")}</h3>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={async () => {
                            setLoading(true);
                            try {
                                await replaceMovements(movements);
                                window.dispatchEvent(new CustomEvent("show-success-toast", {
                                    detail: { message: t("settings.dbSaved") }
                                }));
                                onUpdate();
                            } catch (e) {
                                console.error(e);
                            } finally {
                                setLoading(false);
                            }
                        }}
                        disabled={loading}
                        className="flex items-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-all cursor-pointer"
                    >
                        <span className="material-symbols-outlined text-[14px]">save</span>
                        {loading ? t("settings.saving") : t("settings.saveChanges")}
                    </button>

                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setIsDownloadOpen(!isDownloadOpen)}
                            className="flex items-center gap-2 bg-surface border border-border/60 hover:bg-border/40 text-foreground px-3.5 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-all cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-[16px]">download</span>
                            {t("settings.downloadData")}
                        </button>

                        {isDownloadOpen && (
                            <>
                                <div className="fixed inset-0 z-30" onClick={() => setIsDownloadOpen(false)} />
                                <div className="absolute right-0 mt-2 w-48 rounded-xl bg-surface border border-border shadow-xl z-40 py-1 overflow-hidden animate-in fade-in zoom-in duration-200">
                                    <button
                                        onClick={() => downloadFile("csv")}
                                        className="w-full text-left px-4 py-2.5 text-sm font-medium text-foreground hover:bg-border transition-colors flex items-center gap-2"
                                    >
                                        <span className="material-symbols-outlined text-[18px] text-slate-400">csv</span>
                                        {t("settings.downloadCsv")}
                                    </button>
                                    <button
                                        onClick={() => downloadFile("xlsx")}
                                        className="w-full text-left px-4 py-2.5 text-sm font-medium text-foreground hover:bg-border transition-colors flex items-center gap-2"
                                    >
                                        <span className="material-symbols-outlined text-[18px] text-slate-400">table_view</span>
                                        {t("settings.downloadExcel")}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
            <div className="overflow-x-auto max-h-[360px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200/50 dark:scrollbar-thumb-slate-800/50">
                <table className="w-full text-left border-separate border-spacing-0">
                    <thead className="sticky top-0 z-10 font-bold">
                        <tr className="text-[10px] uppercase text-slate-400 tracking-[0.1em]">
                            <th className="px-6 py-3 w-40 bg-surface/95 backdrop-blur-md border-b border-border/40 group cursor-pointer select-none transition-colors hover:text-primary" onClick={() => handleSort("Date")}>
                                <div className="flex items-center gap-2">
                                    {t("movements.date")}
                                    {renderSortIcon("Date")}
                                </div>
                            </th>
                            <th className="px-6 py-3 bg-surface/95 backdrop-blur-md border-b border-border/40 group cursor-pointer select-none transition-colors hover:text-primary" onClick={() => handleSort("Description")}>
                                <div className="flex items-center gap-2">
                                    {t("movements.descriptionTable")}
                                    {renderSortIcon("Description")}
                                </div>
                            </th>
                            <th className="px-6 py-3 w-56 bg-surface/95 backdrop-blur-md border-b border-border/40 group relative">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 cursor-pointer select-none grow transition-colors hover:text-primary" onClick={() => handleSort("Category")}>
                                        {t("movements.category")}
                                        {renderSortIcon("Category")}
                                    </div>
                                    <div className="relative" ref={filterRef}>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setIsFilterOpen(!isFilterOpen); }}
                                            className={`flex items-center justify-center size-6 rounded-md transition-all cursor-pointer ${selectedCategories.length > 0 ? "bg-primary text-white scale-110" : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-300 hover:text-slate-500"}`}
                                        >
                                            <span className="material-symbols-outlined text-[14px]">filter_alt</span>
                                        </button>
                                        {isFilterOpen && (
                                            <div className="absolute right-0 mt-3 w-64 p-4 bg-surface border border-border/60 rounded-xl shadow-2xl z-50 animate-in fade-in zoom-in slide-in-from-top-2 duration-200 backdrop-blur-xl">
                                                <div className="flex justify-between items-center mb-4">
                                                    <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">{t("settings.categories") || "Categorias"}</span>
                                                    <button onClick={() => onFilterChange([])} className="text-[10px] font-bold text-primary hover:opacity-70 transition-opacity">LIMPAR</button>
                                                </div>
                                                <div className="max-h-64 overflow-y-auto space-y-0.5 pr-1 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
                                                    {allCategories.map(cat => (
                                                        <label key={cat} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer text-sm normal-case font-medium group/item text-slate-600 dark:text-slate-400 hover:text-foreground">
                                                            <input
                                                                type="checkbox"
                                                                className="rounded-[4px] border-slate-300 dark:border-slate-700 text-primary focus:ring-primary/20 size-3.5 transition-all"
                                                                checked={selectedCategories.includes(cat)}
                                                                onChange={() => handleFilterToggle(cat)}
                                                                onClick={e => e.stopPropagation()}
                                                            />
                                                            <span className="truncate">{cat}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </th>
                            <th className="px-6 py-3 w-40 text-right bg-surface/95 backdrop-blur-md border-b border-border/40 group cursor-pointer select-none transition-colors hover:text-primary" onClick={() => handleSort("Value")}>
                                <div className="flex items-center justify-end gap-2 text-right">
                                    {t("movements.value")}
                                    {renderSortIcon("Value")}
                                </div>
                            </th>
                            <th className="px-6 py-3 w-32 text-center bg-surface/95 backdrop-blur-md border-b border-border/40">{t("movements.actions")}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                        {sortedMovements.map((movement) => (
                                <tr key={movement.originalIndex} className="hover:bg-blue-50/30 dark:hover:bg-white/5 transition-all group/row">
                                    <td className="px-6 py-1.5 text-xs text-slate-500 font-medium tabular-nums">
                                        {editingId === movement.originalIndex ? (
                                            <input
                                                type="date"
                                                className="bg-background border-b border-border/40 focus:border-primary focus:outline-none py-1 w-full text-xs transition-colors"
                                                value={csvDateToInputDate(editData?.Date || "")}
                                                onChange={e => setEditData(prev => prev ? { ...prev, Date: inputDateToCsvDate(e.target.value) } : null)}
                                            />
                                        ) : (
                                            movement.Date
                                        )}
                                    </td>
                                    <td className="px-6 py-1.5 text-sm font-medium text-foreground tracking-tight">
                                        {editingId === movement.originalIndex ? (
                                            <input
                                                type="text"
                                                className="bg-background border-b border-border/40 focus:border-primary focus:outline-none py-1 w-full text-xs transition-colors"
                                                value={editData?.Description}
                                                onChange={e => setEditData(prev => prev ? { ...prev, Description: e.target.value } : null)}
                                            />
                                        ) : (
                                            movement.Description
                                        )}
                                    </td>
                                    <td className="px-6 py-1.5">
                                        {editingId === movement.originalIndex ? (
                                            <select
                                                className="bg-transparent border-b border-border/40 focus:border-primary focus:outline-none py-1 w-full text-xs font-bold transition-colors appearance-none"
                                                value={editData?.Category}
                                                onChange={e => setEditData(prev => prev ? { ...prev, Category: e.target.value } : null)}
                                            >
                                                {(editData?.Type === "Income" ? incomeCategories : expenseCategories).map(c => (
                                                    <option key={c} value={c}>{c}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800/80 text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                                                {movement.Category}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-1.5 text-sm font-bold text-right tabular-nums">
                                        {editingId === movement.originalIndex ? (
                                            <div className="flex flex-col gap-1.5 items-end">
                                                <select
                                                    className="bg-transparent border-b border-border/40 focus:border-primary focus:outline-none py-0.5 text-[9px] w-20 appearance-none font-bold uppercase text-slate-400"
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
                                                    className={`bg-transparent border-b border-border/40 focus:border-primary focus:outline-none py-1 w-24 text-right tabular-nums font-bold ${editData?.Type === "Income" ? "text-green-500" : "text-red-500"}`}
                                                    value={editData?.Value}
                                                    onChange={e => setEditData(prev => prev ? { ...prev, Value: Number(e.target.value) } : null)}
                                                />
                                            </div>
                                        ) : (
                                            <span className={`tracking-tight ${movement.Type === "Income" ? "text-green-500" : "text-red-500"}`}>
                                                {`${movement.Type === "Income" ? "+" : "-"}${formatCurrency(movement.Value)}`}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-1.5 text-center">
                                        {editingId === movement.originalIndex ? (
                                            <div className="flex justify-center gap-3">
                                                <button onClick={handleSave} disabled={loading} className="text-primary hover:opacity-70 transition-all scale-110">
                                                    <span className="material-symbols-outlined text-[20px]">check_circle</span>
                                                </button>
                                                <button onClick={() => setEditingId(null)} className="text-slate-300 hover:text-slate-500 transition-all">
                                                    <span className="material-symbols-outlined text-[20px]">cancel</span>
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex justify-center gap-2 opacity-0 group-hover/row:opacity-100 transition-all transform translate-x-1 group-hover/row:translate-x-0">
                                                <button onClick={() => handleEdit(movement.originalIndex)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-primary/10 text-slate-400 hover:text-primary transition-all">
                                                    <span className="material-symbols-outlined text-[16px]">edit</span>
                                                </button>
                                                <button onClick={() => handleDelete(movement.originalIndex)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-all">
                                                    <span className="material-symbols-outlined text-[16px]">delete</span>
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>

            <ConfirmModal
                isOpen={modalConfig.isOpen}
                title={modalConfig.title}
                message={modalConfig.message}
                confirmLabel={modalConfig.confirmLabel}
                onConfirm={modalConfig.onConfirm}
                onCancel={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
                variant={modalConfig.variant}
            />
        </div>
    );
}
