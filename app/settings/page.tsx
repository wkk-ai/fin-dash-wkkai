"use client";

import { useEffect, useState, useRef } from "react";
import { AssetEntry } from "@/types/database";
import { useTranslation } from "@/lib/i18n";
import { formatCurrency, parseCustomDate, cn } from "@/lib/utils";
import { ConfirmModal } from "@/components/ConfirmModal";
import { FormattedNumberInput } from "@/components/FormattedNumberInput";
import { loadPendingData, savePendingData, clearPendingData } from "@/lib/pending-storage";

export default function Settings() {
    const { t } = useTranslation();
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
    const hasUserEditedRef = useRef(false);

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
        const pending = loadPendingData();
        if (pending && pending.length > 0) {
            // Restore unsaved changes from previous session (e.g. after switching tabs)
            hasUserEditedRef.current = true;
            const sorted = [...pending].sort((a, b) => {
                const dateA = parseCustomDate(a.Date).getTime();
                const dateB = parseCustomDate(b.Date).getTime();
                if (dateA !== dateB) return dateB - dateA;
                return b.Value - a.Value;
            });
            setData(sorted);
            const usedClasses = Array.from(new Set(pending.map(r => r.Classification))).filter(Boolean);
            const usedAssets = Array.from(new Set(pending.map(r => r.Asset))).filter(Boolean);
            setDbClassifications(usedClasses);
            setDbAssets(usedAssets);
            // Still need settings (classifications, assets) from API
            fetch("/api/settings")
                .then(res => res.json())
                .then(setSettings)
                .catch(console.error);
            setLoading(false);
        } else {
            hasUserEditedRef.current = false;
            clearPendingData();
            fetchData();
        }

        // Handle updates from AddAssetModal non-destructively
        const handleAdd = (e: any) => {
            const newRow = e.detail;
            if (newRow) {
                hasUserEditedRef.current = true;
                setData(prevData => {
                    const updated = [newRow, ...prevData];
                    return updated.sort((a, b) => {
                        const dateA = parseCustomDate(a.Date).getTime();
                        const dateB = parseCustomDate(b.Date).getTime();
                        if (dateA !== dateB) return dateB - dateA;
                        return b.Value - a.Value;
                    });
                });
                if (newRow.Classification) setDbClassifications(prev => Array.from(new Set([...prev, newRow.Classification])));
                if (newRow.Asset) setDbAssets(prev => Array.from(new Set([...prev, newRow.Asset])));
            } else {
                clearPendingData();
                fetchData();
            }
        };

        window.addEventListener("asset-added", handleAdd);
        return () => window.removeEventListener("asset-added", handleAdd);
    }, []);

    // Persist data to sessionStorage ONLY when user has explicitly edited (delete, edit, add)
    useEffect(() => {
        if (hasUserEditedRef.current && data.length > 0) {
            savePendingData(data);
        }
    }, [data]);

    const saveSettingsSection = async (type: "class" | "asset") => {
        const isClass = type === "class";
        const currentList = isClass ? settings.classifications : settings.assets;
        const dbList = isClass ? dbClassifications : dbAssets;

        // Safety check: is any item from DB missing in current list?
        const missing = dbList.filter(item => !currentList.includes(item));

        if (missing.length > 0) {
            setModalConfig({
                isOpen: true,
                title: t("settings.cannotSave"),
                message: t("settings.missingInUse", { missing: missing.join(", ") }),
                confirmLabel: t("common.understood"),
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
                title: t("settings.cannotDelete"),
                message: t("settings.classInUse", { name: c }),
                confirmLabel: t("common.understood"),
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
                title: t("settings.cannotDelete"),
                message: t("settings.assetInUse", { name: a }),
                confirmLabel: t("common.understood"),
                onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
            });
            return;
        }
        setSettings(prev => ({ ...prev, assets: prev.assets.filter(x => x !== a) }));
    };

    const handleDataChange = (index: number, field: keyof AssetEntry, value: string) => {
        hasUserEditedRef.current = true;
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
                title: t("settings.attention"),
                message: t("settings.emptyDbWarning"),
                confirmLabel: t("common.understood"),
                onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
                variant: "primary"
            });
            return;
        }

        setModalConfig({
            isOpen: true,
            title: t("settings.saveChangesConfirm"),
            message: t("settings.saveConfirmMessage", { count: data.length }),
            confirmLabel: t("common.save"),
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
                    hasUserEditedRef.current = false;
                    clearPendingData();
                    window.dispatchEvent(new CustomEvent("pending-saved"));
                    setModalConfig({
                        isOpen: true,
                        title: t("settings.success"),
                        message: t("settings.dbSaved"),
                        confirmLabel: t("common.ok"),
                        onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
                        variant: "primary"
                    });
                } catch (e) {
                    console.error(e);
                    setModalConfig({
                        isOpen: true,
                        title: t("settings.error"),
                        message: t("settings.saveError"),
                        confirmLabel: t("common.ok"),
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
            title: t("settings.deleteRecord"),
            message: t("settings.deleteConfirm"),
            confirmLabel: t("common.delete"),
            variant: "danger",
            onConfirm: () => {
                hasUserEditedRef.current = true;
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
                <h1 className="text-3xl font-bold text-foreground">{t("settings.title")}</h1>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-300 mt-1">
                    {t("settings.subtitle")}
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-bottom-4 fade-in duration-700">

                {/* Classifications */}
                <div className="rounded-xl bg-surface border border-border shadow-sm p-6 flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold text-foreground">{t("settings.classifications")}</h3>
                        <button
                            type="button"
                            onClick={() => saveSettingsSection("class")}
                            title={t("common.save")}
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
                            placeholder={t("settings.classPlaceholder")}
                            className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <button type="button" onClick={addClassification} className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors cursor-pointer">
                            {t("common.add")}
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
                        <h3 className="text-lg font-bold text-foreground">{t("settings.assets")}</h3>
                        <button
                            type="button"
                            onClick={() => saveSettingsSection("asset")}
                            title={t("common.save")}
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
                            placeholder={t("settings.assetPlaceholder")}
                            className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <button type="button" onClick={addAsset} className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors cursor-pointer">
                            {t("common.add")}
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
                        <h3 className="text-lg font-bold text-foreground">{t("settings.rawDatabase")}</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-300">{t("settings.editCells")}</p>
                    </div>
                    <button
                        type="button"
                        onClick={saveDatabase}
                        disabled={saving}
                        className="flex items-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors cursor-pointer"
                    >
                        <span className="material-symbols-outlined text-[18px]">save</span>
                        {saving ? t("settings.saving") : t("settings.saveChanges")}
                    </button>
                </div>

                <div className="overflow-x-auto max-h-[600px] overflow-y-auto relative">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-20 bg-surface shadow-sm">
                            <tr className="text-xs uppercase text-slate-500 font-bold tracking-wider">
                                <th className="px-4 py-3 border-b border-border bg-surface">{t("common.actions")}</th>
                                <th className="px-4 py-3 border-b border-border bg-surface">{t("settings.date")}</th>
                                <th className="px-4 py-3 border-b border-border bg-surface">{t("settings.classification")}</th>
                                <th className="px-4 py-3 border-b border-border bg-surface">{t("settings.asset")}</th>
                                <th className="px-4 py-3 border-b border-border bg-surface">{t("settings.value")}</th>
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
                                            type="date"
                                            value={csvDateToInputDate(row.Date)}
                                            onChange={(e) => handleDataChange(index, "Date", inputDateToCsvDate(e.target.value))}
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
                                        <FormattedNumberInput
                                            value={row.Value}
                                            onChange={n => handleDataChange(index, "Value", String(n))}
                                            compactSpinner
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
