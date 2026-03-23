"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "@/lib/i18n";
import { parseCustomDate } from "@/lib/utils";
import Portal from "./Portal";
import { DataReviewModal, ProcessedRow } from "./DataReviewModal";
import { fetchSettings as fetchSettingsData, appendNetWorth, appendNetWorthBatch, appendMovement, replaceNetWorth, replaceMovements } from "@/lib/supabase-data";
import { supabase } from "@/lib/supabase";

interface Props {
    onClose: () => void;
}

type ImportType = "patrimonio" | "movimentacao";
type ImportMode = "append" | "overwrite";
type Step = "select" | "upload" | "processing" | "review";


export default function AIImportModal({ onClose }: Props) {
    const { t } = useTranslation();

    const [step, setStep] = useState<Step>("select");
    const [importType, setImportType] = useState<ImportType | null>(null);
    const [importMode, setImportMode] = useState<ImportMode>("append");
    const [file, setFile] = useState<File | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const [processedData, setProcessedData] = useState<ProcessedRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [importing, setImporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Categories/Assets state
    const [classifications, setClassifications] = useState<string[]>([]);
    const [assets, setAssets] = useState<string[]>([]);
    const [incomeCategories, setIncomeCategories] = useState<string[]>([]);
    const [expenseCategories, setExpenseCategories] = useState<string[]>([]);

    useEffect(() => {
        fetchSettingsData()
            .then(data => {
                setClassifications((data.classifications || []).sort((a: string, b: string) => a.localeCompare(b)));
                setAssets((data.assets || []).sort((a: string, b: string) => a.localeCompare(b)));
                setIncomeCategories(data.incomeCategories || []);
                setExpenseCategories(data.expenseCategories || []);
            })
            .catch(err => console.error("Failed to load settings", err));
    }, []);

    // Date helpers
    const dbDateToInputDate = (dbDate: string) => {
        if (!dbDate) return "";
        // Expected "DD/MMM/YY" (e.g. 30/Dec/25)
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
        const month = months[monthStr] || "01";
        return `${year}-${month}-${day}`;
    };

    const inputDateToDbDate = (inputDate: string) => {
        if (!inputDate) return "";
        const dateObj = new Date(inputDate);
        if (isNaN(dateObj.getTime())) return inputDate;

        const day = String(dateObj.getUTCDate()).padStart(2, "0");
        const month = dateObj.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
        const year = String(dateObj.getUTCFullYear()).slice(-2);
        return `${day}/${month}/${year}`;
    };

    const handleTypeSelect = (type: ImportType) => {
        setImportType(type);
    };

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const droppedFile = e.dataTransfer.files?.[0];
        if (droppedFile) setFile(droppedFile);
    }, []);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) setFile(selectedFile);
    };

    const handleProcess = async () => {
        if (!file || !importType) return;

        setLoading(true);
        setError(null);
        setStep("processing");

        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("type", importType);

            // Call Supabase Edge Function for AI import
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-import`,
                {
                    method: "POST",
                    body: formData,
                    headers: {
                        Authorization: `Bearer ${session?.access_token}`,
                    },
                }
            );

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Erro ao processar arquivo");
            }

            const rows: ProcessedRow[] = (data.rows || []).map((r: any, i: number) => ({
                id: `row-${i}-${Math.random().toString(36).substr(2, 6)}`,
                ...r,
            }));

            setProcessedData(rows);
            setStep("review");
        } catch (err: any) {
            setError(err.message || "Erro desconhecido");
            setStep("upload");
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteRow = (id: string) => {
        setProcessedData(prev => prev.filter(r => r.id !== id));
    };

    const handleUpdateRow = (id: string, field: keyof ProcessedRow, value: string | number) => {
        setProcessedData(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
    };

    const handleConfirmImport = async (currentData: ProcessedRow[], currentMode: ImportMode) => {
        if (currentData.length === 0) return;
        setImporting(true);
        setError(null);

        try {


            if (currentMode === "overwrite") {
                const dataToSend = currentData.map(r => {
                    const dateObj = parseCustomDate(r.Date || "");
                    const day = String(dateObj.getUTCDate()).padStart(2, "0");
                    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                    const month = months[dateObj.getUTCMonth()];
                    const year = String(dateObj.getUTCFullYear()).slice(-2);
                    const normalizedDate = `${day}/${month}/${year}`;

                    if (importType === "patrimonio") {
                        return {
                            Date: normalizedDate,
                            Classification: r.Classification || "",
                            Institution: "",
                            Asset: r.Asset || "",
                            Value: r.Value
                        };
                    }
                    return {
                        Date: normalizedDate,
                        Description: r.Description,
                        Category: r.Category,
                        Type: r.Value >= 0 ? "Income" as const : "Expense" as const,
                        Value: r.Value
                    };
                });

                if (importType === "patrimonio") {
                    await replaceNetWorth(dataToSend as any);
                } else {
                    await replaceMovements(dataToSend as any);
                }
            } else {
                for (const r of currentData) {
                    const dateObj = parseCustomDate(r.Date || "");
                    const day = String(dateObj.getUTCDate()).padStart(2, "0");
                    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                    const month = months[dateObj.getUTCMonth()];
                    const year = String(dateObj.getUTCFullYear()).slice(-2);
                    const normalizedDate = `${day}/${month}/${year}`;

                    if (importType === "patrimonio") {
                        await appendNetWorth({
                            Date: normalizedDate,
                            Classification: r.Classification || "",
                            Institution: "",
                            Asset: r.Asset || "",
                            Value: r.Value,
                        });
                    } else {
                        await appendMovement({
                            Date: normalizedDate,
                            Description: r.Description,
                            Category: r.Category,
                            Type: r.Value >= 0 ? "Income" : "Expense",
                            Value: r.Value,
                        });
                    }
                }
            }

            // Dispatch events so pages refresh
            if (importType === "patrimonio") {
                window.dispatchEvent(new CustomEvent("asset-added-success"));
                window.dispatchEvent(new CustomEvent("asset-added"));
            } else {
                window.dispatchEvent(new CustomEvent("movement-added-success"));
                window.dispatchEvent(new CustomEvent("movement-added"));
            }

            onClose();
        } catch (err: any) {
            console.error("Import error:", err);
            setError(err.message || "Erro ao importar dados");
        } finally {
            setImporting(false);
        }
    };

    const isMovimentacao = importType === "movimentacao";

    // ---- RENDER ----
    return (
        <Portal>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">

                {/* Step: Review */}
                {step === "review" ? (
                    <DataReviewModal
                        type={importType || "movimentacao"}
                        initialData={processedData}
                        onClose={onClose}
                        onImport={handleConfirmImport}
                        isImporting={importing}
                    />
                ) : (
                    /* Steps: Select + Upload + Processing */
                    <div className="w-full max-w-xl bg-white dark:bg-[#1e293b] rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="p-6 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined text-primary text-2xl">auto_awesome</span>
                                <h2 className="text-xl font-bold text-slate-800 dark:text-white">Importar com IA</h2>
                            </div>
                            <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-slate-400 transition-colors cursor-pointer">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="px-6 pb-6 space-y-5">
                            {/* Description */}
                            <p className="text-sm text-slate-400">
                                Selecione o tipo de dados que deseja processar usando nossa inteligência artificial para organizar suas finanças automaticamente.
                            </p>

                            {/* Type Selection */}
                            <div className="space-y-3">
                                <button
                                    onClick={() => handleTypeSelect("patrimonio")}
                                    className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all cursor-pointer text-left ${importType === "patrimonio"
                                        ? "border-primary/50 bg-primary/5"
                                        : "border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500"
                                        }`}
                                >
                                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                                        <span className="material-symbols-outlined text-primary text-2xl">account_balance</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-slate-800 dark:text-white">Patrimônio</p>
                                        <p className="text-xs text-slate-400 mt-0.5">Importe seus bens, imóveis e investimentos consolidados para análise de carteira.</p>
                                    </div>
                                    <span className="material-symbols-outlined text-slate-400 dark:text-slate-500">chevron_right</span>
                                </button>

                                <button
                                    onClick={() => handleTypeSelect("movimentacao")}
                                    className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all cursor-pointer text-left ${importType === "movimentacao"
                                        ? "border-primary/50 bg-primary/5"
                                        : "border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500"
                                        }`}
                                >
                                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                                        <span className="material-symbols-outlined text-primary text-2xl">swap_horiz</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-slate-800 dark:text-white">Movimentação</p>
                                        <p className="text-xs text-slate-400 mt-0.5">Importe extratos bancários, faturas de cartão e histórico de transações diárias.</p>
                                    </div>
                                    <span className="material-symbols-outlined text-slate-400 dark:text-slate-500">chevron_right</span>
                                </button>
                            </div>

                            {/* File Upload Area */}
                            {importType && (
                                <div
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    onClick={() => fileInputRef.current?.click()}
                                    className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 transition-all cursor-pointer ${dragOver
                                        ? "border-primary bg-primary/10"
                                        : file
                                            ? "border-primary/50 bg-primary/5"
                                            : "border-slate-300 dark:border-slate-600 hover:border-primary/50"
                                        }`}
                                >
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".pdf,.csv,.xls,.xlsx,.txt"
                                        onChange={handleFileSelect}
                                        className="hidden"
                                    />
                                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-primary text-2xl">
                                            {file ? "check_circle" : "upload"}
                                        </span>
                                    </div>
                                    {file ? (
                                        <div className="text-center">
                                            <p className="text-sm font-bold text-primary">{file.name}</p>
                                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                                                {(file.size / 1024).toFixed(1)} KB · Clique para trocar
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="text-center">
                                            <p className="text-sm text-slate-600 dark:text-slate-300">
                                                Arraste e solte o arquivo aqui ou{" "}
                                                <span className="text-primary font-bold">clique para procurar</span>
                                            </p>
                                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">PDF, CSV, XLS, TXT (MÁX. 10MB)</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {error && (
                                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                                    {error}
                                </div>
                            )}

                            {/* Processing State */}
                            {step === "processing" && (
                                <div className="flex flex-col items-center gap-3 py-6">
                                    <div className="w-10 h-10 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
                                    <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Processando com IA...</p>
                                    <p className="text-xs text-slate-400 dark:text-slate-500">Analisando e extraindo dados do arquivo</p>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 dark:border-slate-800">
                            <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500 min-w-0 flex-1">
                                <span className="material-symbols-outlined text-[14px] flex-shrink-0">lock</span>
                                <span className="leading-tight">Seus dados são criptografados</span>
                            </div>
                            {step !== "processing" && (
                                <div className="flex items-center gap-3 flex-shrink-0">
                                    <div className="flex items-center gap-2">
                                        <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-red-400/80 hover:text-red-400 dark:bg-red-500/5 hover:bg-red-500/10 transition-colors rounded-xl border border-red-500/10 hover:border-red-500/30 cursor-pointer">
                                            Cancelar
                                        </button>
                                        {importType && (
                                            <button
                                                onClick={() => setImportType(null)}
                                                className="px-5 py-2.5 text-sm font-bold text-slate-200 hover:text-white transition-colors rounded-xl border border-slate-700 hover:border-slate-600 cursor-pointer"
                                            >
                                                Voltar
                                            </button>
                                        )}
                                    </div>
                                    {importType && file && (
                                        <button
                                            onClick={handleProcess}
                                            disabled={loading}
                                            className="px-6 py-2.5 text-sm font-bold text-white bg-primary hover:bg-primary/90 rounded-xl shadow-lg shadow-primary/20 transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                                            Processar
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </Portal>
    );
}
