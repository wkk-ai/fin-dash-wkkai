"use client";

import { useState, useRef, useCallback } from "react";
import { useTranslation } from "@/lib/i18n";
import Portal from "./Portal";

interface Props {
    onClose: () => void;
}

type ImportType = "patrimonio" | "movimentacao";
type ImportMode = "append" | "overwrite";
type Step = "select" | "upload" | "processing" | "review";

interface ProcessedRow {
    id: string;
    Date: string;
    Description: string;
    Category: string;
    Value: number;
    // For patrimonio
    Classification?: string;
    Asset?: string;
}

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

            const res = await fetch("/api/ai-import", {
                method: "POST",
                body: formData,
            });

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

    const handleConfirmImport = async () => {
        if (processedData.length === 0) return;
        setImporting(true);
        setError(null);

        try {
            const endpoint = importType === "patrimonio" ? "/api/database" : "/api/movements";

            if (importMode === "overwrite") {
                // Overwrite: send all data at once
                const action = importType === "patrimonio" ? "updateAll" : "updateMovements";
                const dataToSend = processedData.map(r => {
                    if (importType === "patrimonio") {
                        return { Date: r.Date, Classification: r.Classification || "", Asset: r.Asset || "", Value: r.Value };
                    }
                    return { Date: r.Date, Description: r.Description, Category: r.Category, Type: r.Value >= 0 ? "Income" : "Expense", Value: r.Value };
                });
                await fetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action, data: dataToSend }),
                });
            } else {
                // Append: add each row individually
                for (const r of processedData) {
                    const rowData = importType === "patrimonio"
                        ? { Date: r.Date, Classification: r.Classification || "", Asset: r.Asset || "", Value: r.Value }
                        : { Date: r.Date, Description: r.Description, Category: r.Category, Type: r.Value >= 0 ? "Income" : "Expense", Value: r.Value };

                    await fetch(endpoint, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "append", data: rowData }),
                    });
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
            setError(err.message || "Erro ao importar dados");
        } finally {
            setImporting(false);
        }
    };

    const isMovimentacao = importType === "movimentacao";

    // ---- RENDER ----
    return (
        <Portal>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">

                {/* Step: Review */}
                {step === "review" ? (
                    <div className="w-full max-w-4xl bg-[#0c1a2e] rounded-2xl shadow-2xl border border-primary-500/10 animate-in fade-in zoom-in-95 duration-200">
                        {/* Review Header */}
                        <div className="p-6 flex items-start justify-between">
                            <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined text-primary-400 text-2xl">auto_awesome</span>
                                <div>
                                    <h2 className="text-xl font-bold text-white">Revisar Dados Processados</h2>
                                    <p className="text-sm text-slate-400 mt-0.5">
                                        A IA identificou {processedData.length} {isMovimentacao ? "transações" : "ativos"}. Verifique antes de importar.
                                    </p>
                                </div>
                            </div>
                            <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 transition-colors cursor-pointer">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        {/* Review Table */}
                        <div className="px-6">
                            <div className="border border-primary-500/10 rounded-xl overflow-hidden">
                                <div className="overflow-x-auto max-h-[350px] overflow-y-auto">
                                    <table className="w-full text-left">
                                        <thead className="bg-primary-500/5 sticky top-0">
                                            <tr className="text-[11px] font-bold text-primary-400 uppercase tracking-widest">
                                                <th className="px-4 py-3">Data</th>
                                                <th className="px-4 py-3">{isMovimentacao ? "Descrição" : "Classificação"}</th>
                                                <th className="px-4 py-3">{isMovimentacao ? "Categoria" : "Ativo"}</th>
                                                <th className="px-4 py-3 text-right">Valor</th>
                                                <th className="px-4 py-3 w-10"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800">
                                            {processedData.map((row) => (
                                                <tr key={row.id} className="hover:bg-slate-800/50 transition-colors group">
                                                    <td className="px-4 py-2">
                                                        <input
                                                            type="text"
                                                            value={row.Date}
                                                            onChange={(e) => handleUpdateRow(row.id, "Date", e.target.value)}
                                                            className="w-[90px] bg-transparent text-sm text-slate-300 border border-transparent hover:border-slate-700 focus:border-primary-500 focus:bg-slate-900 rounded px-2 py-1 outline-none transition-colors"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <input
                                                            type="text"
                                                            value={isMovimentacao ? row.Description : row.Classification}
                                                            onChange={(e) => handleUpdateRow(row.id, isMovimentacao ? "Description" : "Classification", e.target.value)}
                                                            className="w-full min-w-[200px] bg-transparent text-sm font-medium text-white border border-transparent hover:border-slate-700 focus:border-primary-500 focus:bg-slate-900 rounded px-2 py-1 outline-none transition-colors"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <input
                                                            type="text"
                                                            value={isMovimentacao ? row.Category : row.Asset}
                                                            onChange={(e) => handleUpdateRow(row.id, isMovimentacao ? "Category" : "Asset", e.target.value)}
                                                            className="w-[140px] bg-primary-500/10 text-primary-400 border border-primary-500/20 hover:border-primary-500/40 focus:bg-slate-900 focus:border-primary-500 text-xs font-bold rounded-lg px-2.5 py-1.5 outline-none transition-colors"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-2 text-right">
                                                        <div className="flex items-center justify-end gap-1">
                                                            <span className="text-sm font-bold text-slate-400">R$</span>
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                value={row.Value}
                                                                onChange={(e) => handleUpdateRow(row.id, "Value", parseFloat(e.target.value) || 0)}
                                                                className="w-[90px] bg-transparent text-sm font-bold text-right text-white border border-transparent hover:border-slate-700 focus:border-primary-500 focus:bg-slate-900 rounded px-2 py-1 outline-none transition-colors"
                                                                dir="rtl"
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
                            <div className="border border-slate-700 rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="material-symbols-outlined text-slate-400 text-[18px]">settings</span>
                                    <h3 className="text-sm font-bold text-white">Configurações de Importação</h3>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={() => setImportMode("append")}
                                        className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${importMode === "append"
                                            ? "border-primary-500/50 bg-primary-500/5"
                                            : "border-slate-700 hover:border-slate-600"
                                            }`}
                                    >
                                        <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${importMode === "append" ? "border-primary-500" : "border-slate-600"}`}>
                                            {importMode === "append" && <div className="w-2 h-2 rounded-full bg-primary-500" />}
                                        </div>
                                        <div className="text-left">
                                            <p className="text-sm font-bold text-white">Anexar aos dados existentes</p>
                                            <p className="text-xs text-slate-400 mt-0.5">Mantém o histórico atual e adiciona os novos registros.</p>
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => setImportMode("overwrite")}
                                        className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${importMode === "overwrite"
                                            ? "border-primary-500/50 bg-primary-500/5"
                                            : "border-slate-700 hover:border-slate-600"
                                            }`}
                                    >
                                        <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${importMode === "overwrite" ? "border-primary-500" : "border-slate-600"}`}>
                                            {importMode === "overwrite" && <div className="w-2 h-2 rounded-full bg-primary-500" />}
                                        </div>
                                        <div className="text-left">
                                            <p className="text-sm font-bold text-white">Substituir todos os dados</p>
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
                        <div className="p-6 flex items-center justify-end gap-3">
                            <button onClick={onClose} className="px-6 py-3 text-sm font-bold text-slate-400 hover:text-white transition-colors rounded-xl border border-slate-700 hover:border-slate-600 cursor-pointer">
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirmImport}
                                disabled={importing || processedData.length === 0}
                                className="px-8 py-3 text-sm font-bold text-white bg-primary-500 hover:bg-primary-600 rounded-xl shadow-lg shadow-primary-500/20 transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                            >
                                {importing ? "Importando..." : "Confirmar e Importar"}
                                {!importing && <span className="material-symbols-outlined text-[18px]">check_circle</span>}
                            </button>
                        </div>
                    </div>
                ) : (
                    /* Steps: Select + Upload + Processing */
                    <div className="w-full max-w-lg bg-[#0c1a2e] rounded-2xl shadow-2xl border border-primary-500/10 animate-in fade-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="p-6 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined text-primary-400 text-2xl">auto_awesome</span>
                                <h2 className="text-xl font-bold text-white">Importar com IA</h2>
                            </div>
                            <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 transition-colors cursor-pointer">
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
                                        ? "border-primary-500/50 bg-primary-500/5"
                                        : "border-slate-700 hover:border-slate-500"
                                        }`}
                                >
                                    <div className="w-12 h-12 rounded-xl bg-primary-500/10 flex items-center justify-center flex-shrink-0">
                                        <span className="material-symbols-outlined text-primary-400 text-2xl">account_balance</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-white">Patrimônio</p>
                                        <p className="text-xs text-slate-400 mt-0.5">Importe seus bens, imóveis e investimentos consolidados para análise de carteira.</p>
                                    </div>
                                    <span className="material-symbols-outlined text-slate-500">chevron_right</span>
                                </button>

                                <button
                                    onClick={() => handleTypeSelect("movimentacao")}
                                    className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all cursor-pointer text-left ${importType === "movimentacao"
                                        ? "border-primary-500/50 bg-primary-500/5"
                                        : "border-slate-700 hover:border-slate-500"
                                        }`}
                                >
                                    <div className="w-12 h-12 rounded-xl bg-primary-500/10 flex items-center justify-center flex-shrink-0">
                                        <span className="material-symbols-outlined text-primary-400 text-2xl">swap_horiz</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-white">Movimentação</p>
                                        <p className="text-xs text-slate-400 mt-0.5">Importe extratos bancários, faturas de cartão e histórico de transações diárias.</p>
                                    </div>
                                    <span className="material-symbols-outlined text-slate-500">chevron_right</span>
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
                                        ? "border-primary-400 bg-primary-500/10"
                                        : file
                                            ? "border-primary-500/50 bg-primary-500/5"
                                            : "border-slate-600 hover:border-primary-500/50"
                                        }`}
                                >
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".pdf,.csv,.xls,.xlsx,.txt"
                                        onChange={handleFileSelect}
                                        className="hidden"
                                    />
                                    <div className="w-12 h-12 rounded-full bg-primary-500/10 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-primary-400 text-2xl">
                                            {file ? "check_circle" : "upload"}
                                        </span>
                                    </div>
                                    {file ? (
                                        <div className="text-center">
                                            <p className="text-sm font-bold text-primary-400">{file.name}</p>
                                            <p className="text-xs text-slate-500 mt-1">
                                                {(file.size / 1024).toFixed(1)} KB · Clique para trocar
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="text-center">
                                            <p className="text-sm text-slate-300">
                                                Arraste e solte o arquivo aqui ou{" "}
                                                <span className="text-primary-400 font-bold">clique para procurar</span>
                                            </p>
                                            <p className="text-xs text-slate-500 mt-1">PDF, CSV, XLS, TXT (MÁX. 10MB)</p>
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
                                    <div className="w-10 h-10 border-3 border-primary-500/20 border-t-primary-500 rounded-full animate-spin" />
                                    <p className="text-sm font-medium text-slate-300">Processando com IA...</p>
                                    <p className="text-xs text-slate-500">Analisando e extraindo dados do arquivo</p>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 flex items-center justify-between border-t border-slate-800">
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                <span className="material-symbols-outlined text-[14px]">lock</span>
                                Seus dados são criptografados
                            </div>
                            {step !== "processing" && (
                                <div className="flex items-center gap-3">
                                    <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-slate-400 hover:text-white transition-colors rounded-xl border border-slate-700 hover:border-slate-600 cursor-pointer">
                                        Cancelar
                                    </button>
                                    {importType && file && (
                                        <button
                                            onClick={handleProcess}
                                            disabled={loading}
                                            className="px-6 py-2.5 text-sm font-bold text-white bg-primary-500 hover:bg-primary-600 rounded-xl shadow-lg shadow-primary-500/20 transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer"
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
