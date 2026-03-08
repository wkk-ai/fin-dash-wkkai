"use client";

import { useState, useEffect, useRef } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { useTranslation } from "@/lib/i18n";
import { MovementEntry } from "@/types/database";
import { ConfirmModal } from "./ConfirmModal";
import { DataReviewModal, ProcessedRow } from "./DataReviewModal";

interface Props {
    movements: MovementEntry[];
    onUpdate: () => void;
}

export default function MovementsTable({ movements, onUpdate }: Props) {
    const { t, formatCurrency } = useTranslation();
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editData, setEditData] = useState<MovementEntry | null>(null);
    const [loading, setLoading] = useState(false);
    const [importingFile, setImportingFile] = useState(false);
    const [reviewData, setReviewData] = useState<ProcessedRow[] | null>(null);
    const [isDownloadOpen, setIsDownloadOpen] = useState(false);
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

    const fileInputRef = useRef<HTMLInputElement>(null);

    const [incomeCategories, setIncomeCategories] = useState<string[]>([]);
    const [expenseCategories, setExpenseCategories] = useState<string[]>([]);

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

    const handleImportFile = async (file: File) => {
        setImportingFile(true);
        try {
            const fileName = file.name.toLowerCase();
            let parsedData: any[] = [];

            if (fileName.endsWith(".csv")) {
                const text = await file.text();
                const result = Papa.parse(text, { header: true, skipEmptyLines: true });
                parsedData = result.data;
            } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
                const buffer = await file.arrayBuffer();
                const workbook = XLSX.read(buffer);
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                parsedData = XLSX.utils.sheet_to_json(worksheet);
            }

            // Convert to ProcessedRow format
            const formattedData: ProcessedRow[] = parsedData.map((row: any, index: number) => {
                // Normalize keys to lowercase for easier matching
                const normalizedRow: any = {};
                Object.keys(row).forEach(key => {
                    normalizedRow[key.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")] = row[key];
                });

                const rawDate = normalizedRow.date || normalizedRow.data || "";
                const dateObj = parseCustomDate(String(rawDate));
                const day = String(dateObj.getUTCDate()).padStart(2, "0");
                const month = dateObj.toLocaleString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace(".", "");
                const capitalizedMonth = month.charAt(0).toUpperCase() + month.slice(1);
                const year = String(dateObj.getUTCFullYear()).slice(-2);
                const standardizedDate = `${day}/${capitalizedMonth}/${year}`;

                return {
                    id: `manual-${index}-${Date.now()}`,
                    Date: standardizedDate,
                    Description: normalizedRow.description || normalizedRow.descricao || normalizedRow.historico || "",
                    Category: normalizedRow.category || normalizedRow.categoria || "",
                    Value: parseFloat(String(normalizedRow.value || normalizedRow.valor || "0").replace(",", "."))
                };
            }).filter(r => r.Date && r.Description);

            setReviewData(formattedData);
        } catch (e) {
            console.error(e);
            window.dispatchEvent(new CustomEvent("show-success-toast", {
                detail: { message: t("settings.importError"), variant: "danger" }
            }));
        } finally {
            setImportingFile(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleConfirmImport = async (data: ProcessedRow[], mode: "append" | "overwrite") => {
        setImportingFile(true);
        try {
            if (mode === "overwrite") {
                const dataToSend = data.map(r => ({
                    Date: r.Date,
                    Description: r.Description,
                    Category: r.Category,
                    Type: r.Value >= 0 ? "Income" : "Expense",
                    Value: r.Value
                }));

                const res = await fetch("/api/movements", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "updateMovements", data: dataToSend }),
                });
                if (!res.ok) throw new Error("Failed to overwrite");
            } else {
                for (const r of data) {
                    await fetch("/api/movements", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            action: "append",
                            data: {
                                Date: r.Date,
                                Description: r.Description,
                                Category: r.Category,
                                Type: r.Value >= 0 ? "Income" : "Expense",
                                Value: r.Value
                            }
                        }),
                    });
                }
            }

            onUpdate();
            window.dispatchEvent(new CustomEvent("movement-added"));
            window.dispatchEvent(new CustomEvent("show-success-toast", {
                detail: { message: t("settings.importSuccess") }
            }));
            setReviewData(null);
        } catch (e) {
            console.error(e);
            window.dispatchEvent(new CustomEvent("show-success-toast", {
                detail: { message: t("settings.importError"), variant: "danger" }
            }));
        } finally {
            setImportingFile(false);
        }
    };

    const downloadFile = (type: "csv" | "xlsx") => {
        setIsDownloadOpen(false);
        const sortedData = [...movements].sort((a, b) => {
            const dateSort = parseCustomDate(b.Date).getTime() - parseCustomDate(a.Date).getTime();
            if (dateSort !== 0) return dateSort;
            return b.Value - a.Value;
        });

        if (type === "csv") {
            const csv = Papa.unparse(sortedData);
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.setAttribute("download", `movements-${new Date().toISOString().slice(0, 10)}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else {
            const worksheet = XLSX.utils.json_to_sheet(sortedData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Movements");
            XLSX.writeFile(workbook, `movements-${new Date().toISOString().slice(0, 10)}.xlsx`);
        }
    };

    return (
        <div className="rounded-xl bg-surface border border-border shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-background/50">
                <h3 className="text-lg font-bold text-foreground">{t("movements.history")}</h3>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={async () => {
                            setLoading(true);
                            try {
                                await fetch("/api/movements", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ action: "updateMovements", data: movements }),
                                });
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
                        disabled={loading || importingFile}
                        className="flex items-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors cursor-pointer"
                    >
                        <span className="material-symbols-outlined text-[10px]">save</span>
                        {loading ? t("settings.saving") : t("settings.saveChanges")}
                    </button>
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={loading || importingFile}
                        className="flex items-center gap-2 bg-surface border border-border hover:bg-border disabled:opacity-50 text-foreground px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors cursor-pointer"
                    >
                        <span className="material-symbols-outlined text-[18px]">upload_file</span>
                        {importingFile ? t("settings.importing") : t("settings.importFile")}
                    </button>

                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setIsDownloadOpen(!isDownloadOpen)}
                            className="flex items-center gap-2 bg-surface border border-border hover:bg-border text-foreground px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-[18px]">download</span>
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
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImportFile(file);
                    }}
                />
            </div>
            <div className="overflow-x-auto max-h-[320px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
                <table className="w-full text-left border-separate border-spacing-0">
                    <thead className="sticky top-0 z-10 shadow-sm font-bold">
                        <tr className="text-xs uppercase text-slate-500 tracking-wider">
                            <th className="px-6 py-3 w-32 bg-surface/95 backdrop-blur-sm border-b border-border">{t("movements.date")}</th>
                            <th className="px-6 py-3 bg-surface/95 backdrop-blur-sm border-b border-border">{t("movements.descriptionTable")}</th>
                            <th className="px-6 py-3 w-48 bg-surface/95 backdrop-blur-sm border-b border-border">{t("movements.category")}</th>
                            <th className="px-6 py-3 w-40 text-right bg-surface/95 backdrop-blur-sm border-b border-border">{t("movements.value")}</th>
                            <th className="px-6 py-3 w-32 text-center bg-surface/95 backdrop-blur-sm border-b border-border">{t("movements.actions")}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {movements
                            .map((m, originalIndex) => ({ ...m, originalIndex }))
                            .sort((a, b) => {
                                const dateSort = parseCustomDate(b.Date).getTime() - parseCustomDate(a.Date).getTime();
                                if (dateSort !== 0) return dateSort;
                                return b.Value - a.Value;
                            })
                            .map((movement) => (
                                <tr key={movement.originalIndex} className="hover:bg-blue-50/50 dark:hover:bg-white/5 transition-colors group">
                                    <td className="px-6 py-1.5 text-sm text-slate-600 dark:text-slate-400">
                                        {editingId === movement.originalIndex ? (
                                            <input
                                                type="date"
                                                className="bg-background border-b border-border focus:border-primary focus:outline-none py-0.5 w-full text-sm"
                                                value={csvDateToInputDate(editData?.Date || "")}
                                                onChange={e => setEditData(prev => prev ? { ...prev, Date: inputDateToCsvDate(e.target.value) } : null)}
                                            />
                                        ) : (
                                            movement.Date
                                        )}
                                    </td>
                                    <td className="px-6 py-1.5 text-sm font-medium text-foreground">
                                        {editingId === movement.originalIndex ? (
                                            <input
                                                type="text"
                                                className="bg-background border-b border-border focus:border-primary focus:outline-none py-0.5 w-full text-sm"
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
                                                className="bg-background border-b border-border focus:border-primary focus:outline-none py-0.5 w-full text-sm font-medium"
                                                value={editData?.Category}
                                                onChange={e => setEditData(prev => prev ? { ...prev, Category: e.target.value } : null)}
                                            >
                                                {(editData?.Type === "Income" ? incomeCategories : expenseCategories).map(c => (
                                                    <option key={c} value={c}>{c}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <span className="text-sm font-medium text-foreground">
                                                {movement.Category}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-1.5 text-sm font-bold text-right">
                                        {editingId === movement.originalIndex ? (
                                            <div className="flex flex-col gap-1 items-end">
                                                <select
                                                    className="bg-background border-b border-border focus:border-primary focus:outline-none py-0.5 text-[10px] w-20"
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
                                                    className={`bg-background border-b border-border focus:border-primary focus:outline-none py-0.5 w-24 text-right ${editData?.Type === "Income" ? "text-green-500" : "text-red-500"}`}
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
                                    <td className="px-6 py-1.5 text-center">
                                        {editingId === movement.originalIndex ? (
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
                                                <button onClick={() => handleEdit(movement.originalIndex)} className="text-primary hover:text-primary/80 transition-colors">
                                                    <span className="material-symbols-outlined text-lg">edit</span>
                                                </button>
                                                <button onClick={() => handleDelete(movement.originalIndex)} className="text-slate-400 hover:text-red-500 transition-colors">
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
            {reviewData && (
                <DataReviewModal
                    type="movimentacao"
                    initialData={reviewData}
                    onClose={() => setReviewData(null)}
                    onImport={handleConfirmImport}
                    isImporting={importingFile}
                />
            )}

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
