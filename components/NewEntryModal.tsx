"use client";

import { useState, useEffect } from "react";
import { useTranslation } from "@/lib/i18n";
import { FormattedNumberInput } from "@/components/FormattedNumberInput";
import { CustomCombobox } from "@/components/CustomCombobox";
import { AssetEntry, MovementEntry } from "@/types/database";
import { fetchSettings as fetchSettingsData, appendNetWorth, appendNetWorthBatch, appendMovement } from "@/lib/supabase-data";

import Portal from "./Portal";

interface Props {
    onClose: () => void;
}

export default function NewEntryModal({ onClose }: Props) {
    const { t } = useTranslation();

    // Top Level State
    const [entryType, setEntryType] = useState<"patrimonio" | "movimentacao">("patrimonio");
    const [loading, setLoading] = useState(false);

    // Patrimônio states
    const [patrimonioTab, setPatrimonioTab] = useState<"single" | "multiple">("single");
    const [classifications, setClassifications] = useState<string[]>([]);
    const [institutions, setInstitutions] = useState<string[]>([]);
    const [assets, setAssets] = useState<string[]>([]);

    const [singleAsset, setSingleAsset] = useState({
        Date: new Date().toISOString().split("T")[0],
        Classification: "",
        Institution: "",
        Asset: "",
        Value: "",
    });
    const [multipleAssets, setMultipleAssets] = useState<{ id: string, Date: string, Classification: string, Institution: string, Asset: string, Value: string }[]>([
        { id: Math.random().toString(36).substr(2, 9), Date: new Date().toISOString().split("T")[0], Classification: "", Institution: "", Asset: "", Value: "" }
    ]);

    // Movimentação states
    const [movimentacaoType, setMovimentacaoType] = useState<"Income" | "Expense">("Expense");
    const [movimentacaoTab, setMovimentacaoTab] = useState<"single" | "multiple">("single");
    const [incomeCategories, setIncomeCategories] = useState<string[]>([]);
    const [expenseCategories, setExpenseCategories] = useState<string[]>([]);
    const [loadingCategories, setLoadingCategories] = useState(true);

    const [singleMovement, setSingleMovement] = useState<MovementEntry>({
        Date: new Date().toISOString().split("T")[0],
        Description: "",
        Category: "",
        Type: "Expense",
        Value: 0
    });
    const [multipleMovements, setMultipleMovements] = useState<{ id: string; Date: string; Description: string; Category: string; Value: number }[]>([
        { id: Math.random().toString(36).substr(2, 9), Date: new Date().toISOString().split("T")[0], Description: "", Category: "", Value: 0 }
    ]);

    // Data Fetching
    useEffect(() => {
        fetchSettingsData()
            .then(data => {
                // Patrimônio Data
                const sortedClasses = (data.classifications || []).sort((a: string, b: string) => a.localeCompare(b));
                const sortedInstitutions = (data.institutions || []).sort((a: string, b: string) => a.localeCompare(b));
                const sortedAssets = (data.assets || []).sort((a: string, b: string) => a.localeCompare(b));
                setClassifications(sortedClasses);
                setInstitutions(sortedInstitutions);
                setAssets(sortedAssets);

                if (sortedClasses.length > 0) {
                    setSingleAsset(prev => ({ ...prev, Classification: sortedClasses[0] }));
                    setMultipleAssets(prev => prev.map(row => ({ ...row, Classification: sortedClasses[0] })));
                }
                if (sortedInstitutions.length > 0) {
                    setSingleAsset(prev => ({ ...prev, Institution: sortedInstitutions[0] }));
                    setMultipleAssets(prev => prev.map(row => ({ ...row, Institution: sortedInstitutions[0] })));
                }
                if (sortedAssets.length > 0) {
                    setSingleAsset(prev => ({ ...prev, Asset: sortedAssets[0] }));
                    setMultipleAssets(prev => prev.map(row => ({ ...row, Asset: sortedAssets[0] })));
                }

                // Movimentação Data
                const incCats = data.incomeCategories || [];
                const expCats = data.expenseCategories || [];
                setIncomeCategories(incCats);
                setExpenseCategories(expCats);
                setLoadingCategories(false);

                const currentCats = singleMovement.Type === "Income" ? incCats : expCats;
                if (currentCats.length > 0) {
                    setSingleMovement(prev => ({ ...prev, Category: currentCats[0] }));
                    setMultipleMovements(prev => prev.map(row => ({ ...row, Category: currentCats[0] })));
                }
            })
            .catch(err => {
                console.error("Failed to load settings data", err);
                setLoadingCategories(false);
            });
    }, []);

    // Sync Movimentation Type changes with Categories
    useEffect(() => {
        setSingleMovement(prev => ({ ...prev, Type: movimentacaoType }));
        const currentCats = movimentacaoType === "Income" ? incomeCategories : expenseCategories;

        if (currentCats.length > 0 && !currentCats.includes(singleMovement.Category)) {
            setSingleMovement(prev => ({ ...prev, Category: currentCats[0] }));
        }

        setMultipleMovements(prev => prev.map(row => {
            if (currentCats.length > 0 && !currentCats.includes(row.Category)) {
                return { ...row, Category: currentCats[0] };
            }
            return row;
        }));
    }, [movimentacaoType, incomeCategories, expenseCategories]);

    const formatDBDate = (dateStr: string) => {
        const dateObj = new Date(dateStr);
        const day = String(dateObj.getUTCDate()).padStart(2, "0");
        const month = dateObj.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
        const year = String(dateObj.getUTCFullYear()).slice(-2);
        return `${day}/${month}/${year}`;
    };

    // --- PATRIMÔNIO HANDLERS ---
    const handleSavePatrimonioSingle = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const newRow: AssetEntry = {
            Date: formatDBDate(singleAsset.Date),
            Classification: singleAsset.Classification,
            Institution: singleAsset.Institution,
            Asset: singleAsset.Asset,
            Value: Number(singleAsset.Value) || 0,
        };

        try {
            await appendNetWorth(newRow);
            window.dispatchEvent(new CustomEvent("asset-added-success"));
            window.dispatchEvent(new CustomEvent("asset-added", { detail: newRow }));
            setTimeout(onClose, 50);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSavePatrimonioMultiple = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const newRows: AssetEntry[] = multipleAssets
            .filter(row => row.Value !== "" && Number(row.Value) !== 0)
            .map(row => ({
                Date: formatDBDate(row.Date),
                Classification: row.Classification,
                Institution: row.Institution,
                Asset: row.Asset,
                Value: Number(row.Value),
            }));

        if (newRows.length === 0) {
            setLoading(false);
            return;
        }

        try {
            await appendNetWorthBatch(newRows);
            window.dispatchEvent(new CustomEvent("asset-added-success"));
            window.dispatchEvent(new CustomEvent("asset-added", { detail: newRows[0] }));
            setTimeout(onClose, 50);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const addAssetRow = () => {
        setMultipleAssets([...multipleAssets, {
            id: Math.random().toString(36).substr(2, 9),
            Date: new Date().toISOString().split("T")[0],
            Classification: classifications[0] || "",
            Institution: institutions[0] || "",
            Asset: assets[0] || "",
            Value: ""
        }]);
    };

    const removeAssetRow = (id: string) => {
        if (multipleAssets.length > 1) {
            setMultipleAssets(multipleAssets.filter(r => r.id !== id));
        }
    };

    const updateAssetRow = (id: string, field: keyof typeof multipleAssets[0], value: string) => {
        setMultipleAssets(multipleAssets.map(r => r.id === id ? { ...r, [field]: value } : r));
    };

    // --- MOVIMENTAÇÃO HANDLERS ---
    const handleSaveMovimentacao = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const itemsToSave = movimentacaoTab === "single"
            ? [{ ...singleMovement, Date: formatDBDate(singleMovement.Date) }]
            : multipleMovements
                .filter(row => row.Description.trim() !== "" && row.Value !== 0)
                .map(row => ({
                    Date: formatDBDate(row.Date),
                    Description: row.Description,
                    Category: row.Category,
                    Type: movimentacaoType,
                    Value: row.Value
                }));

        if (itemsToSave.length === 0) {
            setLoading(false);
            return;
        }

        try {
            for (const item of itemsToSave) {
                await appendMovement(item as MovementEntry);
            }
            window.dispatchEvent(new CustomEvent("movement-added-success"));
            window.dispatchEvent(new CustomEvent("movement-added"));
            setTimeout(onClose, 50);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const addMovementRow = () => {
        const currentCats = movimentacaoType === "Income" ? incomeCategories : expenseCategories;
        setMultipleMovements([...multipleMovements, {
            id: Math.random().toString(36).substr(2, 9),
            Date: new Date().toISOString().split("T")[0],
            Description: "",
            Category: currentCats[0] || "",
            Value: 0
        }]);
    };

    const removeMovementRow = (id: string) => {
        if (multipleMovements.length > 1) {
            setMultipleMovements(multipleMovements.filter(r => r.id !== id));
        }
    };

    const updateMovementRow = (id: string, field: string, value: any) => {
        setMultipleMovements(multipleMovements.map(r => r.id === id ? { ...r, [field]: value } : r));
    };


    // Base Colors based on context
    const isMovimentacao = entryType === "movimentacao";
    const isIncome = movimentacaoType === "Income";
    const primaryColorClass = isMovimentacao ? (isIncome ? "text-emerald-500" : "text-rose-500") : "text-blue-500";
    const primaryBorderClass = isMovimentacao ? (isIncome ? "border-emerald-500/20" : "border-rose-500/20") : "border-blue-500/20";
    const primaryBgClass = isMovimentacao ? (isIncome ? "bg-emerald-500 hover:bg-emerald-600" : "bg-rose-500 hover:bg-rose-600") : "bg-blue-500 hover:bg-blue-600";
    const primaryShadowClass = isMovimentacao ? (isIncome ? "shadow-emerald-500/25" : "shadow-rose-500/25") : "shadow-blue-500/25";
    const selectedItemIndicator = isMovimentacao ? (isIncome ? "bg-emerald-500" : "bg-rose-500") : "bg-blue-500";

    // Label translations and helpers
    const saveButtonText = isMovimentacao
        ? (isIncome ? "Salvar Receita" : "Salvar Despesa")
        : (patrimonioTab === "single" ? "Salvar Patrimônio" : "Salvar Patrimônios");

    return (
        <Portal>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
                <div className={`w-full bg-white dark:bg-[#1e293b] rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200 ${entryType === "movimentacao" && movimentacaoTab === "multiple" ? "max-w-4xl" :
                        entryType === "patrimonio" && patrimonioTab === "multiple" ? "max-w-4xl" : "max-w-lg"
                    }`}>

                    {/* Header */}
                    <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
                        <h2 className="text-lg font-bold text-slate-800 dark:text-white uppercase tracking-wider">Nova Entrada</h2>
                        <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-slate-400 dark:text-slate-500 transition-colors">
                            <span className="material-symbols-outlined block">close</span>
                        </button>
                    </div>

                    {/* Top Type Selector */}
                    <div className="p-3 bg-slate-50 dark:bg-slate-900/50 flex gap-2">
                        <button
                            onClick={() => setEntryType("patrimonio")}
                            className={`flex-1 flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl text-sm font-bold transition-all border-2 ${entryType === "patrimonio"
                                    ? "border-blue-500/20 bg-white dark:bg-slate-800 text-blue-500 shadow-sm"
                                    : "border-transparent text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800"
                                }`}
                        >
                            <span className="material-symbols-outlined text-xl">account_balance</span>
                            Patrimônio
                        </button>
                        <button
                            onClick={() => setEntryType("movimentacao")}
                            className={`flex-1 flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl text-sm font-bold transition-all border-2 ${entryType === "movimentacao"
                                    ? "border-rose-500/20 bg-white dark:bg-slate-800 text-rose-500 shadow-sm"
                                    : "border-transparent text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800"
                                }`}
                        >
                            <span className="material-symbols-outlined text-xl">swap_horiz</span>
                            Movimentação
                        </button>
                    </div>

                    <div className="p-6 space-y-8">
                        {/* Nested Top Selectors: Income/Expense OR Single/Multiple Patrimônio */}
                        {entryType === "movimentacao" ? (
                            <div className="p-1 rounded-xl bg-slate-100 dark:bg-[#0f172a] flex border border-slate-200 dark:border-slate-800">
                                <button
                                    onClick={() => setMovimentacaoType("Income")}
                                    className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${movimentacaoType === "Income"
                                            ? "bg-white dark:bg-slate-800 shadow-md border border-slate-200 dark:border-slate-700 text-emerald-500"
                                            : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                        }`}
                                >
                                    Receita
                                </button>
                                <button
                                    onClick={() => setMovimentacaoType("Expense")}
                                    className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${movimentacaoType === "Expense"
                                            ? "bg-white dark:bg-slate-800 shadow-md border border-slate-200 dark:border-slate-700 text-rose-500"
                                            : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                        }`}
                                >
                                    Despesa
                                </button>
                            </div>
                        ) : null}

                        {/* Nested Bottom Selectors: Single/Multiple Selection */}
                        <div className="flex gap-8 justify-center border-b border-border/50 pb-px">
                            {entryType === "movimentacao" ? (
                                <>
                                    <button
                                        onClick={() => setMovimentacaoTab("single")}
                                        className={`relative pb-3 text-sm font-semibold transition-colors ${movimentacaoTab === "single" ? primaryColorClass : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"}`}
                                    >
                                        Uma Movimentação
                                        {movimentacaoTab === "single" && <span className={`absolute bottom-0 left-0 w-full h-0.5 rounded-full ${selectedItemIndicator}`}></span>}
                                    </button>
                                    <button
                                        onClick={() => setMovimentacaoTab("multiple")}
                                        className={`relative pb-3 text-sm font-semibold transition-colors ${movimentacaoTab === "multiple" ? primaryColorClass : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"}`}
                                    >
                                        Várias Movimentações
                                        {movimentacaoTab === "multiple" && <span className={`absolute bottom-0 left-0 w-full h-0.5 rounded-full ${selectedItemIndicator}`}></span>}
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        onClick={() => setPatrimonioTab("single")}
                                        className={`relative pb-3 text-sm font-semibold transition-colors ${patrimonioTab === "single" ? primaryColorClass : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"}`}
                                    >
                                        Ativo Único
                                        {patrimonioTab === "single" && <span className={`absolute bottom-0 left-0 w-full h-0.5 rounded-full ${selectedItemIndicator}`}></span>}
                                    </button>
                                    <button
                                        onClick={() => setPatrimonioTab("multiple")}
                                        className={`relative pb-3 text-sm font-semibold transition-colors ${patrimonioTab === "multiple" ? primaryColorClass : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"}`}
                                    >
                                        Vários Ativos
                                        {patrimonioTab === "multiple" && <span className={`absolute bottom-0 left-0 w-full h-0.5 rounded-full ${selectedItemIndicator}`}></span>}
                                    </button>
                                </>
                            )}
                        </div>

                        {/* Forms Area */}
                        {entryType === "movimentacao" && movimentacaoTab === "single" && (
                            <form id="unified-form" onSubmit={handleSaveMovimentacao} className="grid grid-cols-1 gap-5">
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">Data</label>
                                    <input
                                        type="date"
                                        required
                                        value={singleMovement.Date}
                                        onChange={e => setSingleMovement({ ...singleMovement, Date: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-[#0f172a] border-2 border-slate-100 dark:border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white focus:ring-0 focus:border-primary transition-all outline-none"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">Descrição</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Ex: Aluguel, Supermercado..."
                                        value={singleMovement.Description}
                                        onChange={e => setSingleMovement({ ...singleMovement, Description: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-[#0f172a] border-2 border-slate-100 dark:border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:ring-0 focus:border-primary transition-all outline-none"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">Categoria</label>
                                        <CustomCombobox
                                            options={movimentacaoType === "Income" ? incomeCategories : expenseCategories}
                                            required
                                            placeholder="Ex: Moradia"
                                            value={singleMovement.Category}
                                            onChange={val => setSingleMovement({ ...singleMovement, Category: val })}
                                            className="w-full bg-slate-50 dark:bg-[#0f172a] border-2 border-slate-100 dark:border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white focus:ring-0 focus:border-primary transition-all outline-none"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">Valor (R$)</label>
                                        <FormattedNumberInput
                                            value={singleMovement.Value}
                                            onChange={n => setSingleMovement({ ...singleMovement, Value: n })}
                                            required
                                            placeholder="Ex: 0,00"
                                            className="w-full bg-slate-50 dark:bg-[#0f172a] border-2 border-slate-100 dark:border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white font-semibold focus:ring-0 focus:border-primary transition-all outline-none"
                                        />
                                    </div>
                                </div>
                            </form>
                        )}

                        {entryType === "movimentacao" && movimentacaoTab === "multiple" && (
                            <form id="unified-form" onSubmit={handleSaveMovimentacao} className="space-y-4">
                                <div className="overflow-x-auto max-h-[400px]">
                                    <table className="w-full text-left min-w-[800px]">
                                        <thead>
                                            <tr className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                                                <th className="pb-3 pr-4 w-1/5">Data</th>
                                                <th className="pb-3 pr-4 w-1/3">Descrição</th>
                                                <th className="pb-3 pr-4 w-1/4">Categoria</th>
                                                <th className="pb-3 pr-4 w-1/5 text-right">Valor (R$)</th>
                                                <th className="pb-3 w-10"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="space-y-2">
                                            {multipleMovements.map((row) => (
                                                <tr key={row.id}>
                                                    <td className="py-2 pr-4">
                                                        <input
                                                            type="date"
                                                            required
                                                            value={row.Date}
                                                            onChange={e => updateMovementRow(row.id, "Date", e.target.value)}
                                                            className="w-full bg-slate-50 dark:bg-[#0f172a] border-2 border-slate-100 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-0 focus:border-primary transition-all outline-none"
                                                        />
                                                    </td>
                                                    <td className="py-2 pr-4">
                                                        <input
                                                            type="text"
                                                            required
                                                            placeholder="Ex: Aluguel"
                                                            value={row.Description}
                                                            onChange={e => updateMovementRow(row.id, "Description", e.target.value)}
                                                            className="w-full bg-slate-50 dark:bg-[#0f172a] border-2 border-slate-100 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-0 focus:border-primary transition-all outline-none"
                                                        />
                                                    </td>
                                                    <td className="py-2 pr-4">
                                                        <CustomCombobox
                                                            options={movimentacaoType === "Income" ? incomeCategories : expenseCategories}
                                                            placeholder="Adicionar..."
                                                            value={row.Category}
                                                            onChange={val => updateMovementRow(row.id, "Category", val)}
                                                            className="w-full bg-slate-50 dark:bg-[#0f172a] border-2 border-slate-100 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-0 focus:border-primary transition-all outline-none"
                                                        />
                                                    </td>
                                                    <td className="py-2 pr-4">
                                                        <FormattedNumberInput
                                                            value={row.Value}
                                                            onChange={n => updateMovementRow(row.id, "Value", n)}
                                                            placeholder="0,00"
                                                            className="w-full bg-slate-50 dark:bg-[#0f172a] border-2 border-slate-100 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white font-semibold focus:ring-0 focus:border-primary transition-all outline-none"
                                                        />
                                                    </td>
                                                    <td className="py-2 text-right">
                                                        <button type="button" onClick={() => removeMovementRow(row.id)} className="text-slate-400 hover:text-red-500 transition-colors">
                                                            <span className="material-symbols-outlined">delete</span>
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <button type="button" onClick={addMovementRow} className={`flex items-center gap-2 font-bold text-sm transition-colors ${primaryColorClass} hover:opacity-80`}>
                                    <span className="material-symbols-outlined text-[18px]">add_circle</span>
                                    Adicionar Nova Linha
                                </button>
                            </form>
                        )}

                        {entryType === "patrimonio" && patrimonioTab === "single" && (
                            <form id="unified-form" onSubmit={handleSavePatrimonioSingle} className="grid grid-cols-1 gap-5">
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">Data</label>
                                    <input
                                        type="date"
                                        required
                                        value={singleAsset.Date}
                                        onChange={e => setSingleAsset({ ...singleAsset, Date: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-[#0f172a] border-2 border-slate-100 dark:border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white focus:ring-0 focus:border-primary transition-all outline-none"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">Classificação</label>
                                    <CustomCombobox
                                        options={classifications}
                                        required
                                        placeholder="Ex: Renda Fixa"
                                        value={singleAsset.Classification}
                                        onChange={val => setSingleAsset({ ...singleAsset, Classification: val })}
                                        className="w-full bg-slate-50 dark:bg-[#0f172a] border-2 border-slate-100 dark:border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white focus:ring-0 focus:border-primary transition-all outline-none"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">Instituição</label>
                                        <CustomCombobox
                                            options={institutions}
                                            required
                                            placeholder="Ex: Nubank"
                                            value={singleAsset.Institution}
                                            onChange={val => setSingleAsset({ ...singleAsset, Institution: val })}
                                            className="w-full bg-slate-50 dark:bg-[#0f172a] border-2 border-slate-100 dark:border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white focus:ring-0 focus:border-primary transition-all outline-none"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">Ativo</label>
                                        <CustomCombobox
                                            options={assets}
                                            required
                                            placeholder="Ex: CDB 100%"
                                            value={singleAsset.Asset}
                                            onChange={val => setSingleAsset({ ...singleAsset, Asset: val })}
                                            className="w-full bg-slate-50 dark:bg-[#0f172a] border-2 border-slate-100 dark:border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white focus:ring-0 focus:border-primary transition-all outline-none"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1">Valor Total (R$)</label>
                                        <FormattedNumberInput
                                            value={Number(singleAsset.Value) || 0}
                                            onChange={n => setSingleAsset(prev => ({ ...prev, Value: n === 0 ? "" : String(n) }))}
                                            required
                                            placeholder="Ex: 0,00"
                                            className="w-full bg-slate-50 dark:bg-[#0f172a] border-2 border-slate-100 dark:border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white font-semibold focus:ring-0 focus:border-primary transition-all outline-none"
                                        />
                                    </div>
                                </div>
                            </form>
                        )}

                        {entryType === "patrimonio" && patrimonioTab === "multiple" && (
                            <form id="unified-form" onSubmit={handleSavePatrimonioMultiple} className="space-y-4">
                                <div className="overflow-x-auto max-h-[400px]">
                                    <table className="w-full text-left min-w-[800px]">
                                        <thead>
                                            <tr className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                                                <th className="pb-3 pr-4 w-[15%]">Data</th>
                                                <th className="pb-3 pr-4 w-[20%]">Classificação</th>
                                                <th className="pb-3 pr-4 w-[20%]">Instituição</th>
                                                <th className="pb-3 pr-4 w-[20%]">Ativo</th>
                                                <th className="pb-3 pr-4 w-1/5 text-right">Valor Total (R$)</th>
                                                <th className="pb-3 w-10"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="space-y-2">
                                            {multipleAssets.map((row) => (
                                                <tr key={row.id}>
                                                    <td className="py-2 pr-4">
                                                        <input
                                                            type="date"
                                                            required
                                                            value={row.Date}
                                                            onChange={e => updateAssetRow(row.id, "Date", e.target.value)}
                                                            className="w-full bg-slate-50 dark:bg-[#0f172a] border-2 border-slate-100 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-0 focus:border-primary transition-all outline-none"
                                                        />
                                                    </td>
                                                    <td className="py-2 pr-4">
                                                        <CustomCombobox
                                                            options={classifications}
                                                            placeholder="Adicionar..."
                                                            value={row.Classification}
                                                            onChange={val => updateAssetRow(row.id, "Classification", val)}
                                                            className="w-full bg-slate-50 dark:bg-[#0f172a] border-2 border-slate-100 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-0 focus:border-primary transition-all outline-none"
                                                        />
                                                    </td>
                                                    <td className="py-2 pr-4">
                                                        <CustomCombobox
                                                            options={institutions}
                                                            placeholder="Adicionar..."
                                                            value={row.Institution}
                                                            onChange={val => updateAssetRow(row.id, "Institution", val)}
                                                            className="w-full bg-slate-50 dark:bg-[#0f172a] border-2 border-slate-100 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-0 focus:border-primary transition-all outline-none"
                                                        />
                                                    </td>
                                                    <td className="py-2 pr-4">
                                                        <CustomCombobox
                                                            options={assets}
                                                            placeholder="Adicionar..."
                                                            value={row.Asset}
                                                            onChange={val => updateAssetRow(row.id, "Asset", val)}
                                                            className="w-full bg-slate-50 dark:bg-[#0f172a] border-2 border-slate-100 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-0 focus:border-primary transition-all outline-none"
                                                        />
                                                    </td>
                                                    <td className="py-2 pr-4">
                                                        <FormattedNumberInput
                                                            value={Number(row.Value) || 0}
                                                            onChange={n => updateAssetRow(row.id, "Value", n === 0 ? "" : String(n))}
                                                            placeholder="0,00"
                                                            className="w-full bg-slate-50 dark:bg-[#0f172a] border-2 border-slate-100 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white font-semibold focus:ring-0 focus:border-primary transition-all outline-none"
                                                        />
                                                    </td>
                                                    <td className="py-2 text-right">
                                                        <button type="button" onClick={() => removeAssetRow(row.id)} className="text-slate-400 hover:text-red-500 transition-colors">
                                                            <span className="material-symbols-outlined">delete</span>
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <button type="button" onClick={addAssetRow} className={`flex items-center gap-2 font-bold text-sm transition-colors ${primaryColorClass} hover:opacity-80`}>
                                    <span className="material-symbols-outlined text-[18px]">add_circle</span>
                                    Adicionar Nova Linha
                                </button>
                            </form>
                        )}
                    </div>

                    <div className="px-6 py-6 flex items-center justify-end gap-3 bg-slate-50/50 dark:bg-[#0f172a]/50 border-t border-slate-100 dark:border-slate-800">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-3 text-sm font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            form="unified-form"
                            disabled={loading}
                            className={`px-10 py-3 text-white text-sm font-bold rounded-xl shadow-lg transition-all active:scale-[0.97] disabled:opacity-50 ${primaryBgClass} ${primaryShadowClass}`}
                        >
                            {loading ? "Salvando..." : saveButtonText}
                        </button>
                    </div>

                </div>
            </div>
        </Portal>
    );
}
