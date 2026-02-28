"use client";

import { useEffect, useState } from "react";
import { AssetEntry } from "@/types/database";
import { formatCurrency, parseCustomDate, cn } from "@/lib/utils";
import { ConfirmModal } from "@/components/ConfirmModal";

export default function Settings() {
    const [data, setData] = useState<AssetEntry[]>([]);
    const [settings, setSettings] = useState<{ classifications: string[]; assets: string[] }>({
        classifications: [],
        assets: [],
    });

    // Values currently in the main CSV (cannot be deleted from settings)
    const [dbClassifications, setDbClassifications] = useState<string[]>([]);
    const [dbAssets, setDbAssets] = useState<string[]>([]);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savingSettings, setSavingSettings] = useState<{ type: "class" | "asset" | null }>({ type: null });

    // Modal state
    const [modalConfig, setModalConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        confirmLabel?: string;
        onConfirm: () => void;
        variant?: "danger" | "primary";
    }>({
        isOpen: false,
        title: "",
        message: "",
        onConfirm: () => { },
    });

    // New option states
    const [newClassification, setNewClassification] = useState("");
    const [newAsset, setNewAsset] = useState("");

    const fetchData = async () => {
        setLoading(true);
        try {
            const [dbRes, setRes] = await Promise.all([
                fetch("/api/database"),
                fetch("/api/settings")
            ]);
            const dbJson = await dbRes.json() as AssetEntry[];
            const setJson = await setRes.json();

            // Sort: Date DESC, then Value DESC
            const sortedData = [...dbJson].sort((a, b) => {
                const dateA = parseCustomDate(a.Date).getTime();
                const dateB = parseCustomDate(b.Date).getTime();
                if (dateA !== dateB) return dateB - dateA;
                return b.Value - a.Value;
            });

            setData(sortedData);
            setSettings(setJson);

            // Extract what's currently in use in the DB
            const usedClasses = Array.from(new Set(dbJson.map(r => r.Classification))).filter(Boolean);
            const usedAssets = Array.from(new Set(dbJson.map(r => r.Asset))).filter(Boolean);
            setDbClassifications(usedClasses);
            setDbAssets(usedAssets);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();

        // Handle updates from AddAssetModal non-destructively
        const handleAdd = (e: any) => {
            const newRow = e.detail;
            if (newRow) {
                setData(prevData => {
                    const updated = [newRow, ...prevData];
                    // Sort locally: Date DESC, then Value DESC
                    return updated.sort((a, b) => {
                        const dateA = parseCustomDate(a.Date).getTime();
                        const dateB = parseCustomDate(b.Date).getTime();
                        if (dateA !== dateB) return dateB - dateA;
                        return b.Value - a.Value;
                    });
                });
                // Also update used lists locally if needed
                if (newRow.Classification) setDbClassifications(prev => Array.from(new Set([...prev, newRow.Classification])));
                if (newRow.Asset) setDbAssets(prev => Array.from(new Set([...prev, newRow.Asset])));
            } else {
                fetchData(); // Fallback to full fetch if data is missing
            }
        };

        window.addEventListener("asset-added", handleAdd);
        return () => window.removeEventListener("asset-added", handleAdd);
    }, []);

    const saveSettingsSection = async (type: "class" | "asset") => {
        const isClass = type === "class";
        const currentList = isClass ? settings.classifications : settings.assets;
        const dbList = isClass ? dbClassifications : dbAssets;

        // Safety check: is any item from DB missing in current list?
        const missing = dbList.filter(item => !currentList.includes(item));

        if (missing.length > 0) {
            setModalConfig({
                isOpen: true,
                title: "Não é possível salvar",
                message: `As seguintes opções estão em uso no seu CSV principal e não podem ser removidas: ${missing.join(", ")}. Por favor, adicione-as de volta antes de salvar.`,
                confirmLabel: "Entendido",
                onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
            });
            return;
        }

        setSavingSettings({ type });
        try {
            await fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(settings),
            });
            // Show success briefly or just rely on state
        } catch (e) {
            console.error(e);
        } finally {
            setSavingSettings({ type: null });
        }
    };

    const addClassification = () => {
        if (!newClassification) return;
        if (settings.classifications.includes(newClassification)) return;
        setSettings(prev => ({
            ...prev,
            classifications: [...prev.classifications, newClassification].sort((a, b) => a.localeCompare(b))
        }));
        setNewClassification("");
    };

    const removeClassification = (c: string) => {
        if (dbClassifications.includes(c)) {
            setModalConfig({
                isOpen: true,
                title: "Não é possível excluir",
                message: `A classificação "${c}" está em uso no seu CSV principal e não pode ser removida.`,
                confirmLabel: "Entendido",
                onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
            });
            return;
        }
        setSettings(prev => ({ ...prev, classifications: prev.classifications.filter(x => x !== c) }));
    };

    const addAsset = () => {
        if (!newAsset) return;
        if (settings.assets.includes(newAsset)) return;
        setSettings(prev => ({
            ...prev,
            assets: [...prev.assets, newAsset].sort((a, b) => a.localeCompare(b))
        }));
        setNewAsset("");
    };

    const removeAsset = (a: string) => {
        if (dbAssets.includes(a)) {
            setModalConfig({
                isOpen: true,
                title: "Não é possível excluir",
                message: `O ativo/instituição "${a}" está em uso no seu CSV principal e não pode ser removido.`,
                confirmLabel: "Entendido",
                onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
            });
            return;
        }
        setSettings(prev => ({ ...prev, assets: prev.assets.filter(x => x !== a) }));
    };

    const handleDataChange = (index: number, field: keyof AssetEntry, value: string) => {
        const newData = [...data];
        if (field === "Value") {
            newData[index][field] = Number(value);
        } else {
            newData[index][field] = value as any;
        }
        setData(newData);
    };

    const saveDatabase = async () => {
        if (!data || data.length === 0) {
            setModalConfig({
                isOpen: true,
                title: "Atenção",
                message: "A base de dados não pode ser salva vazia. Isso deletaria todos os seus ativos.",
                confirmLabel: "Entendido",
                onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
                variant: "primary"
            });
            return;
        }

        setModalConfig({
            isOpen: true,
            title: "Salvar Alterações",
            message: `Deseja salvar as alterações em ${data.length} registros no banco de dados? Isso sobrescreverá o arquivo CSV.`,
            confirmLabel: "Salvar",
            variant: "primary",
            onConfirm: async () => {
                setModalConfig(prev => ({ ...prev, isOpen: false }));
                setSaving(true);
                try {
                    await fetch("/api/database", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "updateAll", data }),
                    });
                    setModalConfig({
                        isOpen: true,
                        title: "Sucesso",
                        message: "Base de dados salva com sucesso!",
                        confirmLabel: "OK",
                        onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
                        variant: "primary"
                    });
                } catch (e) {
                    console.error(e);
                    setModalConfig({
                        isOpen: true,
                        title: "Erro",
                        message: "Ocorreu um erro ao salvar a base de dados.",
                        confirmLabel: "OK",
                        onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
                        variant: "danger"
                    });
                } finally {
                    setSaving(false);
                }
            }
        });
    };

    const deleteRow = (e: React.MouseEvent, index: number) => {
        e.preventDefault();
        e.stopPropagation();

        setModalConfig({
            isOpen: true,
            title: "Deletar Registro",
            message: "Tem certeza que deseja deletar esta linha? Esta ação só será permanente após clicar em 'Salvar Alterações'.",
            confirmLabel: "Deletar",
            variant: "danger",
            onConfirm: () => {
                const newData = [...data];
                newData.splice(index, 1);
                setData(newData);
                setModalConfig(prev => ({ ...prev, isOpen: false }));
            }
        });
    };


    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-7xl flex flex-col gap-8 pb-20">
            <div className="animate-in slide-in-from-bottom-2 fade-in duration-500">
                <h1 className="text-3xl font-bold text-foreground">Configurações e Banco de Dados</h1>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-300 mt-1">
                    Gerencie as opções do sistema e edite os dados brutos da sua base (CSV).
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-bottom-4 fade-in duration-700">

                {/* Classifications */}
                <div className="rounded-xl bg-surface border border-border shadow-sm p-6 flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold text-foreground">Classificações</h3>
                        <button
                            type="button"
                            onClick={() => saveSettingsSection("class")}
                            title="salvar"
                            className="p-2 rounded-lg hover:bg-border text-slate-500 hover:text-primary transition-colors cursor-pointer disabled:opacity-50"
                            disabled={savingSettings.type === "class"}
                        >
                            <span className={cn(
                                "material-symbols-outlined text-[20px]",
                                savingSettings.type === "class" && "animate-pulse"
                            )}>
                                save
                            </span>
                        </button>
                    </div>
                    <div className="flex gap-2 mb-4">
                        <input
                            value={newClassification}
                            onChange={e => setNewClassification(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && addClassification()}
                            placeholder="Ex: Renda Variável BR"
                            className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <button type="button" onClick={addClassification} className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors cursor-pointer">
                            Adicionar
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {settings.classifications?.map(c => (
                            <div key={c} className="flex items-center gap-1 bg-border text-foreground px-3 py-1.5 rounded-full text-sm font-medium">
                                {c}
                                <button type="button" onClick={() => removeClassification(c)} className="hover:text-red-500 ml-1 cursor-pointer">
                                    <span className="material-symbols-outlined text-[16px] leading-none">close</span>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Assets */}
                <div className="rounded-xl bg-surface border border-border shadow-sm p-6 flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold text-foreground">Ativos/Instituições</h3>
                        <button
                            type="button"
                            onClick={() => saveSettingsSection("asset")}
                            title="salvar"
                            className="p-2 rounded-lg hover:bg-border text-slate-500 hover:text-primary transition-colors cursor-pointer disabled:opacity-50"
                            disabled={savingSettings.type === "asset"}
                        >
                            <span className={cn(
                                "material-symbols-outlined text-[20px]",
                                savingSettings.type === "asset" && "animate-pulse"
                            )}>
                                save
                            </span>
                        </button>
                    </div>
                    <div className="flex gap-2 mb-4">
                        <input
                            value={newAsset}
                            onChange={e => setNewAsset(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && addAsset()}
                            placeholder="Ex: Rico"
                            className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <button type="button" onClick={addAsset} className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors cursor-pointer">
                            Adicionar
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {settings.assets?.map(a => (
                            <div key={a} className="flex items-center gap-1 bg-border text-foreground px-3 py-1.5 rounded-full text-sm font-medium">
                                {a}
                                <button type="button" onClick={() => removeAsset(a)} className="hover:text-red-500 ml-1 cursor-pointer">
                                    <span className="material-symbols-outlined text-[16px] leading-none">close</span>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Database View/Edit */}
            <div className="rounded-xl bg-surface border border-border shadow-sm flex flex-col animate-in slide-in-from-bottom-8 fade-in duration-1000 overflow-hidden">
                <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-background/50">
                    <div>
                        <h3 className="text-lg font-bold text-foreground">Base de Dados Bruta (CSV)</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-300">Edite as células diretamente</p>
                    </div>
                    <button
                        type="button"
                        onClick={saveDatabase}
                        disabled={saving}
                        className="flex items-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors cursor-pointer"
                    >
                        <span className="material-symbols-outlined text-[18px]">save</span>
                        {saving ? "Salvando..." : "Salvar Alterações"}
                    </button>
                </div>

                <div className="overflow-x-auto max-h-[600px] overflow-y-auto relative">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-20 bg-surface shadow-sm">
                            <tr className="text-xs uppercase text-slate-500 font-bold tracking-wider">
                                <th className="px-4 py-3 border-b border-border bg-surface">Ações</th>
                                <th className="px-4 py-3 border-b border-border bg-surface">Date</th>
                                <th className="px-4 py-3 border-b border-border bg-surface">Classification</th>
                                <th className="px-4 py-3 border-b border-border bg-surface">Asset</th>
                                <th className="px-4 py-3 border-b border-border bg-surface">Value</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border text-sm">
                            {data.map((row, index) => (
                                <tr key={`${row.Date}-${row.Asset}-${index}`} className="hover:bg-background-light dark:hover:bg-white/5 transition-colors group">
                                    <td className="px-4 py-2 w-16">
                                        <button
                                            type="button"
                                            onClick={(e) => deleteRow(e, index)}
                                            className="text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-500/10 cursor-pointer"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">delete</span>
                                        </button>
                                    </td>
                                    <td className="px-4 py-2">
                                        <input
                                            value={row.Date}
                                            onChange={(e) => handleDataChange(index, "Date", e.target.value)}
                                            className="bg-transparent w-full focus:outline-none focus:border-primary border-b border-transparent py-1 text-foreground"
                                        />
                                    </td>
                                    <td className="px-4 py-2">
                                        <select
                                            value={row.Classification}
                                            onChange={(e) => handleDataChange(index, "Classification", e.target.value)}
                                            className="bg-surface w-full focus:outline-none focus:border-primary border-b border-transparent py-1 text-foreground"
                                        >
                                            <option value={row.Classification}>{row.Classification}</option>
                                            {settings.classifications
                                                .filter(c => c !== row.Classification)
                                                .sort((a, b) => a.localeCompare(b))
                                                .map(c => (
                                                    <option key={c} value={c}>{c}</option>
                                                ))}
                                        </select>
                                    </td>
                                    <td className="px-4 py-2">
                                        <select
                                            value={row.Asset}
                                            onChange={(e) => handleDataChange(index, "Asset", e.target.value)}
                                            className="bg-surface w-full focus:outline-none focus:border-primary border-b border-transparent py-1 text-foreground"
                                        >
                                            <option value={row.Asset}>{row.Asset}</option>
                                            {settings.assets
                                                .filter(a => a !== row.Asset)
                                                .sort((a, b) => a.localeCompare(b))
                                                .map(a => (
                                                    <option key={a} value={a}>{a}</option>
                                                ))}
                                        </select>
                                    </td>
                                    <td className="px-4 py-2">
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={row.Value}
                                            onChange={(e) => handleDataChange(index, "Value", e.target.value)}
                                            className="bg-transparent w-full focus:outline-none focus:border-primary border-b border-transparent py-1 text-foreground font-medium"
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <ConfirmModal
                isOpen={modalConfig.isOpen}
                title={modalConfig.title}
                message={modalConfig.message}
                confirmLabel={modalConfig.confirmLabel}
                variant={modalConfig.variant}
                onConfirm={modalConfig.onConfirm}
                onCancel={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
            />
        </div>
    );
}
