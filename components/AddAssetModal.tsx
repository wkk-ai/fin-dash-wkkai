"use client";

import { useState, useEffect } from "react";
import { AssetEntry } from "@/types/database";
import { useTranslation } from "@/lib/i18n";
import { FormattedNumberInput } from "@/components/FormattedNumberInput";

import Portal from "./Portal";

interface Props {
    onClose: () => void;
}

interface NewEntry {
    id: string;
    Date: string;
    Classification: string;
    Asset: string;
    Value: string;
}

export default function AddAssetModal({ onClose }: Props) {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<"single" | "multiple">("single");
    const [classifications, setClassifications] = useState<string[]>([]);
    const [assets, setAssets] = useState<string[]>([]);

    const [singleData, setSingleData] = useState({
        Date: new Date().toISOString().split("T")[0],
        Classification: "",
        Asset: "",
        Value: "",
    });

    const [multipleData, setMultipleData] = useState<NewEntry[]>([
        { id: Math.random().toString(36).substr(2, 9), Date: new Date().toISOString().split("T")[0], Classification: "", Asset: "", Value: "" }
    ]);

    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetch("/api/settings")
            .then((res) => res.json())
            .then((data) => {
                const sortedClasses = (data.classifications || []).sort((a: string, b: string) => a.localeCompare(b));
                const sortedAssets = (data.assets || []).sort((a: string, b: string) => a.localeCompare(b));

                setClassifications(sortedClasses);
                setAssets(sortedAssets);

                if (sortedClasses.length > 0) {
                    setSingleData((prev) => ({ ...prev, Classification: sortedClasses[0] }));
                    setMultipleData((prev) => prev.map(row => ({ ...row, Classification: sortedClasses[0] })));
                }
                if (sortedAssets.length > 0) {
                    setSingleData((prev) => ({ ...prev, Asset: sortedAssets[0] }));
                    setMultipleData((prev) => prev.map(row => ({ ...row, Asset: sortedAssets[0] })));
                }
            });
    }, []);

    const formatDBDate = (dateStr: string) => {
        const dateObj = new Date(dateStr);
        const day = String(dateObj.getUTCDate()).padStart(2, "0");
        const month = dateObj.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
        const year = String(dateObj.getUTCFullYear()).slice(-2);
        return `${day}/${month}/${year}`;
    };

    const handleSingleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const newRow: AssetEntry = {
            Date: formatDBDate(singleData.Date),
            Classification: singleData.Classification,
            Asset: singleData.Asset,
            Value: Number(singleData.Value),
        };

        try {
            await fetch("/api/database", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "append", data: newRow }),
            });
            window.dispatchEvent(new CustomEvent("asset-added-success"));
            window.dispatchEvent(new CustomEvent("asset-added", { detail: newRow }));
            await new Promise((r) => setTimeout(r, 50));
            onClose();
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleMultipleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const newRows: AssetEntry[] = multipleData
            .filter(row => row.Value !== "" && Number(row.Value) !== 0)
            .map(row => ({
                Date: formatDBDate(row.Date),
                Classification: row.Classification,
                Asset: row.Asset,
                Value: Number(row.Value),
            }));

        if (newRows.length === 0) {
            setLoading(false);
            return;
        }

        try {
            // Sequential append or batch if API supports it. Assuming append action supports array or we call multiple times.
            // Best is to call batch if available, but current database API seems to expect one object for 'append'.
            // Let's check api/database later if needed. For now, multiple appends.
            for (const row of newRows) {
                await fetch("/api/database", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "append", data: row }),
                });
            }

            window.dispatchEvent(new CustomEvent("asset-added-success"));
            // Trigger refresh
            window.dispatchEvent(new CustomEvent("asset-added", { detail: newRows[0] }));
            await new Promise((r) => setTimeout(r, 50));
            onClose();
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const addRow = () => {
        setMultipleData([...multipleData, {
            id: Math.random().toString(36).substr(2, 9),
            Date: new Date().toISOString().split("T")[0],
            Classification: classifications[0] || "",
            Asset: assets[0] || "",
            Value: ""
        }]);
    };

    const removeRow = (id: string) => {
        if (multipleData.length > 1) {
            setMultipleData(multipleData.filter(r => r.id !== id));
        }
    };

    const updateRow = (id: string, field: keyof NewEntry, value: string) => {
        setMultipleData(multipleData.map(r => r.id === id ? { ...r, [field]: value } : r));
    };

    return (
        <Portal>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
                <div className={`bg-surface border border-border rounded-xl shadow-xl w-full ${activeTab === "single" ? "max-w-md" : "max-w-4xl"} overflow-hidden animate-in fade-in zoom-in-95 duration-200`}>
                    <div className="px-6 py-4 border-b border-border flex justify-between items-center">
                        <h3 className="text-lg font-bold text-foreground">{t("addAsset.title")}</h3>
                        <button
                            onClick={onClose}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                        >
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>

                    <div className="flex px-6 border-b border-border bg-slate-50/50 dark:bg-slate-900/50">
                        <button
                            onClick={() => setActiveTab("single")}
                            className={`px-6 py-3 text-sm font-medium transition-all border-b-2 ${activeTab === "single" ? "text-primary border-primary" : "text-slate-500 border-transparent hover:text-slate-700 dark:hover:text-slate-300"}`}
                        >
                            {t("addAsset.singleTab")}
                        </button>
                        <button
                            onClick={() => setActiveTab("multiple")}
                            className={`px-6 py-3 text-sm font-medium transition-all border-b-2 ${activeTab === "multiple" ? "text-primary border-primary" : "text-slate-500 border-transparent hover:text-slate-700 dark:hover:text-slate-300"}`}
                        >
                            {t("addAsset.multipleTab")}
                        </button>
                    </div>

                    <div className="p-6">
                        {activeTab === "single" ? (
                            <form onSubmit={handleSingleSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">{t("addAsset.date")}</label>
                                    <input
                                        type="date"
                                        required
                                        value={singleData.Date}
                                        onChange={e => setSingleData({ ...singleData, Date: e.target.value })}
                                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">{t("addAsset.classification")}</label>
                                    <select
                                        required
                                        value={singleData.Classification}
                                        onChange={e => setSingleData({ ...singleData, Classification: e.target.value })}
                                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                    >
                                        {classifications.map((c) => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">{t("addAsset.assetInstitution")}</label>
                                    <select
                                        required
                                        value={singleData.Asset}
                                        onChange={e => setSingleData({ ...singleData, Asset: e.target.value })}
                                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                    >
                                        {assets.map((a) => (
                                            <option key={a} value={a}>{a}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">{t("addAsset.valueBRL")}</label>
                                    <FormattedNumberInput
                                        value={Number(singleData.Value) || 0}
                                        onChange={n => setSingleData(prev => ({ ...prev, Value: n === 0 ? "" : String(n) }))}
                                        placeholder={t("addAsset.valuePlaceholder")}
                                        required
                                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                    />
                                </div>
                                <div className="pt-4 flex justify-end gap-3">
                                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors">
                                        {t("common.cancel")}
                                    </button>
                                    <button type="submit" disabled={loading} className="rounded-lg bg-primary px-6 py-2 text-sm font-bold text-white shadow-md hover:bg-primary/90 transition-all cursor-pointer disabled:opacity-50">
                                        {loading ? t("addAsset.saving") : t("common.add")}
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <form onSubmit={handleMultipleSubmit} className="space-y-6">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left min-w-[800px]">
                                        <thead>
                                            <tr className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                                <th className="pb-3 pr-4 w-1/5">{t("addAsset.date")}</th>
                                                <th className="pb-3 pr-4 w-1/4">{t("addAsset.classification")}</th>
                                                <th className="pb-3 pr-4 w-1/4">{t("addAsset.assetInstitution")}</th>
                                                <th className="pb-3 pr-4 w-1/5">{t("addAsset.valueBRL")}</th>
                                                <th className="pb-3 w-10"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="space-y-2">
                                            {multipleData.map((row) => (
                                                <tr key={row.id}>
                                                    <td className="py-2 pr-4">
                                                        <input
                                                            type="date"
                                                            value={row.Date}
                                                            onChange={e => updateRow(row.id, "Date", e.target.value)}
                                                            className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none transition-all"
                                                        />
                                                    </td>
                                                    <td className="py-2 pr-4">
                                                        <select
                                                            value={row.Classification}
                                                            onChange={e => updateRow(row.id, "Classification", e.target.value)}
                                                            className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none transition-all"
                                                        >
                                                            {classifications.map(c => <option key={c} value={c}>{c}</option>)}
                                                        </select>
                                                    </td>
                                                    <td className="py-2 pr-4">
                                                        <select
                                                            value={row.Asset}
                                                            onChange={e => updateRow(row.id, "Asset", e.target.value)}
                                                            className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none transition-all"
                                                        >
                                                            {assets.map(a => <option key={a} value={a}>{a}</option>)}
                                                        </select>
                                                    </td>
                                                    <td className="py-2 pr-4">
                                                        <FormattedNumberInput
                                                            value={Number(row.Value) || 0}
                                                            onChange={n => updateRow(row.id, "Value", n === 0 ? "" : String(n))}
                                                            placeholder={t("addAsset.valuePlaceholder")}
                                                            className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none transition-all"
                                                        />
                                                    </td>
                                                    <td className="py-2 text-right">
                                                        <button
                                                            type="button"
                                                            onClick={() => removeRow(row.id)}
                                                            className="text-slate-400 hover:text-red-500 transition-colors"
                                                        >
                                                            <span className="material-symbols-outlined">delete</span>
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <button
                                    type="button"
                                    onClick={addRow}
                                    className="flex items-center gap-2 text-primary hover:text-primary/80 font-bold text-sm transition-colors"
                                >
                                    <span className="material-symbols-outlined text-[18px]">add_circle</span>
                                    {t("addAsset.addNewLine")}
                                </button>
                                <div className="pt-4 flex justify-end gap-3 border-t border-border mt-4">
                                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors">
                                        {t("common.cancel")}
                                    </button>
                                    <button type="submit" disabled={loading} className="rounded-lg bg-primary px-8 py-2 text-sm font-bold text-white shadow-md hover:bg-primary/90 transition-all cursor-pointer disabled:opacity-50">
                                        {loading ? t("addAsset.saving") : t("common.add")}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            </div>
        </Portal>
    );
}
