"use client";

import { useEffect, useState } from "react";
import { AssetEntry } from "@/types/database";
import { formatCurrency } from "@/lib/utils";

export default function Settings() {
    const [data, setData] = useState<AssetEntry[]>([]);
    const [settings, setSettings] = useState<{ classifications: string[]; assets: string[] }>({
        classifications: [],
        assets: [],
    });

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

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
            const dbData = await dbRes.json();
            const setData = await setRes.json();
            setData(dbData);
            setSettings(setData);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleSaveSettings = async (updatedSettings: typeof settings) => {
        setSettings(updatedSettings);
        try {
            await fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatedSettings),
            });
        } catch (e) {
            console.error(e);
        }
    };

    const addClassification = () => {
        if (!newClassification) return;
        const updated = { ...settings, classifications: [...settings.classifications, newClassification] };
        handleSaveSettings(updated);
        setNewClassification("");
    };

    const removeClassification = (c: string) => {
        const updated = { ...settings, classifications: settings.classifications.filter(x => x !== c) };
        handleSaveSettings(updated);
    };

    const addAsset = () => {
        if (!newAsset) return;
        const updated = { ...settings, assets: [...settings.assets, newAsset] };
        handleSaveSettings(updated);
        setNewAsset("");
    };

    const removeAsset = (a: string) => {
        const updated = { ...settings, assets: settings.assets.filter(x => x !== a) };
        handleSaveSettings(updated);
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
        setSaving(true);
        try {
            await fetch("/api/database", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "updateAll", data }),
            });
            alert("Base de dados salva com sucesso!");
        } catch (e) {
            console.error(e);
            alert("Erro ao salvar base de dados");
        } finally {
            setSaving(false);
        }
    };

    const deleteRow = (index: number) => {
        if (confirm("Tem certeza que deseja deletar esta linha?")) {
            const newData = [...data];
            newData.splice(index, 1);
            setData(newData);
        }
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
                    <h3 className="text-lg font-bold text-foreground mb-4">Classificações</h3>
                    <div className="flex gap-2 mb-4">
                        <input
                            value={newClassification}
                            onChange={e => setNewClassification(e.target.value)}
                            placeholder="Ex: Renda Variável BR"
                            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <button onClick={addClassification} className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors">
                            Adicionar
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {settings.classifications?.map(c => (
                            <div key={c} className="flex items-center gap-1 bg-border text-foreground px-3 py-1.5 rounded-full text-sm font-medium">
                                {c}
                                <button onClick={() => removeClassification(c)} className="hover:text-red-500 ml-1">
                                    <span className="material-symbols-outlined text-[16px] leading-none">close</span>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Assets */}
                <div className="rounded-xl bg-surface border border-border shadow-sm p-6 flex flex-col">
                    <h3 className="text-lg font-bold text-foreground mb-4">Ativos/Instituições</h3>
                    <div className="flex gap-2 mb-4">
                        <input
                            value={newAsset}
                            onChange={e => setNewAsset(e.target.value)}
                            placeholder="Ex: Rico"
                            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <button onClick={addAsset} className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors">
                            Adicionar
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {settings.assets?.map(a => (
                            <div key={a} className="flex items-center gap-1 bg-border text-foreground px-3 py-1.5 rounded-full text-sm font-medium">
                                {a}
                                <button onClick={() => removeAsset(a)} className="hover:text-red-500 ml-1">
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
                        onClick={saveDatabase}
                        disabled={saving}
                        className="flex items-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors"
                    >
                        <span className="material-symbols-outlined text-[18px]">save</span>
                        {saving ? "Salvando..." : "Salvar Alterações"}
                    </button>
                </div>

                <div className="overflow-x-auto max-h-[600px] overflow-y-auto relative">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-10 bg-surface shadow-sm">
                            <tr className="text-xs uppercase text-slate-500 font-bold tracking-wider">
                                <th className="px-4 py-3 border-b border-border">Ações</th>
                                <th className="px-4 py-3 border-b border-border">Date</th>
                                <th className="px-4 py-3 border-b border-border">Classification</th>
                                <th className="px-4 py-3 border-b border-border">Asset</th>
                                <th className="px-4 py-3 border-b border-border">Value</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border text-sm">
                            {data.map((row, index) => (
                                <tr key={index} className="hover:bg-background-light dark:hover:bg-white/5 transition-colors group">
                                    <td className="px-4 py-2 w-16">
                                        <button onClick={() => deleteRow(index)} className="text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-500/10">
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
                                            {settings.classifications.filter(c => c !== row.Classification).map(c => (
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
                                            {settings.assets.filter(a => a !== row.Asset).map(a => (
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
        </div>
    );
}
