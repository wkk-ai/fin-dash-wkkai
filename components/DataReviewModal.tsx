"use client";

import { useState, useEffect } from "react";
import { useTranslation } from "@/lib/i18n";
import { parseCustomDate } from "@/lib/utils";
import Portal from "./Portal";
import { FormattedNumberInput } from "./FormattedNumberInput";
import { CustomCombobox } from "./CustomCombobox";

export interface ProcessedRow {
    id: string;
    Date: string;
    Description: string;
    Category: string;
    Value: number;
    Classification?: string;
    Asset?: string;
}

type ImportType = "patrimonio" | "movimentacao";
type ImportMode = "append" | "overwrite";

interface Props {
    type: ImportType;
    initialData: ProcessedRow[];
    onClose: () => void;
    onImport: (data: ProcessedRow[], mode: ImportMode) => Promise<void>;
    isImporting?: boolean;
}

export function DataReviewModal({ type, initialData, onClose, onImport, isImporting = false }: Props) {
    const { t } = useTranslation();
    const [processedData, setProcessedData] = useState<ProcessedRow[]>(initialData);
    const [importMode, setImportMode] = useState<ImportMode>("append");
    const [error, setError] = useState<string | null>(null);

    // Categories/Assets state
    const [classifications, setClassifications] = useState<string[]>([]);
    const [assets, setAssets] = useState<string[]>([]);
    const [incomeCategories, setIncomeCategories] = useState<string[]>([]);
    const [expenseCategories, setExpenseCategories] = useState<string[]>([]);

    useEffect(() => {
        fetch("/api/settings")
            .then(res => res.json())
            .then(data => {
                setClassifications((data.classifications || []).sort((a: string, b: string) => a.localeCompare(b)));
                setAssets((data.assets || []).sort((a: string, b: string) => a.localeCompare(b)));
                setIncomeCategories(data.incomeCategories || []);
                setExpenseCategories(data.expenseCategories || []);
            })
            .catch(err => console.error("Failed to load settings", err));
    }, []);

    const isMovimentacao = type === "movimentacao";

    // Date helpers
    const dbDateToInputDate = (dbDate: string) => {
        if (!dbDate) return "";
        const parts = dbDate.split("/");
        if (parts.length !== 3) return dbDate;

        const day = parts[0].padStart(2, "0");
        const monthStr = parts[1].toLowerCase().replace(".", "");
        const yearShort = parts[2];
        const year = `20${yearShort}`;

        const months: Record<string, string> = {
            jan: "01", feb: "02", fev: "02", mar: "03", apr: "04", abr: "04",
            may: "05", mai: "05", jun: "06", jul: "07", aug: "08", ago: "08",
            sep: "09", set: "09", oct: "10", out: "10", nov: "11", dec: "12", dez: "12"
        };
        const month = months[monthStr.toLowerCase().slice(0, 3)] || "01";
        return `${year}-${month}-${day}`;
    };

    const inputDateToDbDate = (inputDate: string) => {
        if (!inputDate) return "";
        const dateObj = parseCustomDate(inputDate);
        if (isNaN(dateObj.getTime())) return inputDate;

        const day = String(dateObj.getUTCDate()).padStart(2, "0");
        const month = dateObj.toLocaleString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace(".", "");
        const capitalizedMonth = month.charAt(0).toUpperCase() + month.slice(1);
        const year = String(dateObj.getUTCFullYear()).slice(-2);
        return `${day}/${capitalizedMonth}/${year}`;
    };

    const handleDeleteRow = (id: string) => {
        setProcessedData(prev => prev.filter(r => r.id !== id));
    };

    const handleUpdateRow = (id: string, field: keyof ProcessedRow, value: string | number) => {
        setProcessedData(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
    };

    const handleConfirmImport = async () => {
        if (processedData.length === 0) return;
        setError(null);
        try {
            await onImport(processedData, importMode);
        } catch (err: any) {
            setError(err.message || "Erro ao importar dados");
        }
    };

    return (
        <Portal>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
                <div className="w-full max-w-4xl bg-white dark:bg-[#1e293b] rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200">
                    {/* Review Header */}
                    <div className="p-6 flex items-start justify-between">
                        <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-primary text-2xl">auto_awesome</span>
                            <div>
                                <h2 className="text-xl font-bold text-slate-800 dark:text-white">Revisar Dados Processados</h2>
                                <p className="text-sm text-slate-400 mt-0.5">
                                    Identificamos {processedData.length} {isMovimentacao ? "transações" : "ativos"}. Verifique antes de importar.
                                </p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-slate-400 transition-colors cursor-pointer">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>

                    {/* Review Table */}
                    <div className="px-6">
                        <div className="border border-primary/10 rounded-xl overflow-hidden">
                            <div className="overflow-x-auto max-h-[350px] overflow-y-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-white dark:bg-[#1e293b] sticky top-0 z-10 shadow-sm border-b border-primary/10">
                                        <tr className="text-[11px] font-bold text-primary uppercase tracking-widest">
                                            <th className="px-4 py-3">Data</th>
                                            <th className="px-4 py-3">{isMovimentacao ? "Descrição" : "Classificação"}</th>
                                            <th className="px-4 py-3">{isMovimentacao ? "Categoria" : "Ativo"}</th>
                                            <th className="px-4 py-3 text-left">Valor</th>
                                            <th className="px-4 py-3 w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {processedData.map((row) => (
                                            <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                                                <td className="px-4 py-2">
                                                    <input
                                                        type="date"
                                                        value={dbDateToInputDate(row.Date)}
                                                        onChange={(e) => handleUpdateRow(row.id, "Date", inputDateToDbDate(e.target.value))}
                                                        className="w-[130px] bg-transparent text-sm text-slate-600 dark:text-slate-300 border border-transparent hover:border-slate-200 dark:border-slate-700 focus:border-primary focus:bg-slate-50 dark:focus:bg-slate-900 rounded px-2 py-1 outline-none transition-colors"
                                                    />
                                                </td>
                                                <td className="px-4 py-2">
                                                    {isMovimentacao ? (
                                                        <input
                                                            type="text"
                                                            value={row.Description}
                                                            onChange={(e) => handleUpdateRow(row.id, "Description", e.target.value)}
                                                            className="w-full min-w-[200px] bg-transparent text-sm font-medium text-slate-800 dark:text-white border border-transparent hover:border-slate-200 dark:border-slate-700 focus:border-primary focus:bg-slate-50 dark:focus:bg-slate-900 rounded px-2 py-1 outline-none transition-colors"
                                                        />
                                                    ) : (
                                                        <CustomCombobox
                                                            options={classifications}
                                                            value={row.Classification || ""}
                                                            onChange={(val) => handleUpdateRow(row.id, "Classification", val)}
                                                            className="w-full min-w-[150px] bg-transparent text-sm font-medium text-slate-800 dark:text-white border border-transparent hover:border-slate-200 dark:border-slate-700 focus:border-primary focus:bg-slate-50 dark:focus:bg-slate-900 rounded px-2 py-1 outline-none transition-colors"
                                                        />
                                                    )}
                                                </td>
                                                <td className="px-4 py-2">
                                                    <CustomCombobox
                                                        options={isMovimentacao ? (row.Value >= 0 ? incomeCategories : expenseCategories) : assets}
                                                        value={isMovimentacao ? row.Category : row.Asset || ""}
                                                        onChange={(val) => handleUpdateRow(row.id, isMovimentacao ? "Category" : "Asset", val)}
                                                        className="w-[160px] bg-primary/10 text-primary border border-primary/20 hover:border-primary/40 focus:bg-slate-50 dark:focus:bg-slate-900 focus:border-primary text-xs font-bold rounded-lg px-2.5 py-1.5 outline-none transition-colors"
                                                    />
                                                </td>
                                                <td className="px-4 py-2 text-left">
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-sm font-bold text-slate-400">R$</span>
                                                        <FormattedNumberInput
                                                            value={row.Value}
                                                            onChange={(n) => handleUpdateRow(row.id, "Value", n)}
                                                            step={100}
                                                            className="w-[100px] bg-transparent text-sm font-bold text-left text-slate-800 dark:text-white border border-transparent hover:border-slate-200 dark:border-slate-700 focus:border-primary focus:bg-slate-50 dark:focus:bg-slate-900 rounded px-2 py-1 outline-none transition-colors"
                                                        />
                                                    </div>
                                                </td>
                                                <td className="px-4 py-2">
                                                    <button
                                                        onClick={() => handleDeleteRow(row.id)}
                                                        className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all cursor-pointer p-1"
                                                        title="Excluir"
                                                    >
                                                        <span className="material-symbols-outlined text-[18px] block">delete</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* Import Settings */}
                    <div className="px-6 mt-5">
                        <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="material-symbols-outlined text-slate-400 text-[18px]">settings</span>
                                <h3 className="text-sm font-bold text-slate-800 dark:text-white">Configurações de Importação</h3>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => setImportMode("append")}
                                    className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${importMode === "append"
                                        ? "border-primary/50 bg-primary/5"
                                        : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:border-slate-600"
                                        }`}
                                >
                                    <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${importMode === "append" ? "border-primary" : "border-slate-300 dark:border-slate-600"}`}>
                                        {importMode === "append" && <div className="w-2 h-2 rounded-full bg-primary" />}
                                    </div>
                                    <div className="text-left">
                                        <p className="text-sm font-bold text-slate-800 dark:text-white">Anexar aos dados existentes</p>
                                        <p className="text-xs text-slate-400 mt-0.5">Mantém o histórico atual e adiciona os novos registros.</p>
                                    </div>
                                </button>
                                <button
                                    onClick={() => setImportMode("overwrite")}
                                    className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${importMode === "overwrite"
                                        ? "border-primary/50 bg-primary/5"
                                        : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:border-slate-600"
                                        }`}
                                >
                                    <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${importMode === "overwrite" ? "border-primary" : "border-slate-300 dark:border-slate-600"}`}>
                                        {importMode === "overwrite" && <div className="w-2 h-2 rounded-full bg-primary" />}
                                    </div>
                                    <div className="text-left">
                                        <p className="text-sm font-bold text-slate-800 dark:text-white">Substituir todos os dados</p>
                                        <p className="text-xs text-slate-400 mt-0.5">Apaga os registros atuais do período e importa os novos.</p>
                                    </div>
                                </button>
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className="mx-6 mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    {/* Review Footer */}
                    <div className="p-6 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500 min-w-0 flex-1">
                            <span className="material-symbols-outlined text-[14px] flex-shrink-0">lock</span>
                            <span className="leading-tight">Seus dados são criptografados</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-red-400/80 hover:text-red-400 dark:bg-red-500/5 hover:bg-red-500/10 transition-colors rounded-xl border border-red-500/10 hover:border-red-500/30 cursor-pointer">
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirmImport}
                                disabled={isImporting || processedData.length === 0}
                                className="px-6 py-2.5 text-sm font-bold text-white bg-primary hover:bg-primary/90 rounded-xl shadow-lg shadow-primary/20 transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                            >
                                {isImporting ? "Importando..." : "Confirmar e Importar"}
                                {!isImporting && <span className="material-symbols-outlined text-[18px]">check_circle</span>}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </Portal>
    );
}
