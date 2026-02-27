"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AssetEntry } from "@/types/database";

interface Props {
    onClose: () => void;
}

export default function AddAssetModal({ onClose }: Props) {
    const router = useRouter();
    const [classifications, setClassifications] = useState<string[]>([]);
    const [assets, setAssets] = useState<string[]>([]);

    const [formData, setFormData] = useState({
        Date: new Date().toISOString().split("T")[0],
        Classification: "",
        Asset: "",
        Value: "",
    });

    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetch("/api/settings")
            .then((res) => res.json())
            .then((data) => {
                setClassifications(data.classifications || []);
                setAssets(data.assets || []);
                if (data.classifications?.length > 0) {
                    setFormData((prev) => ({ ...prev, Classification: data.classifications[0] }));
                }
                if (data.assets?.length > 0) {
                    setFormData((prev) => ({ ...prev, Asset: data.assets[0] }));
                }
            });
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        // Format date from YYYY-MM-DD to DD/MMM/YY (e.g. 01/Jan/25)
        const dateObj = new Date(formData.Date);
        const day = String(dateObj.getDate() + 1).padStart(2, "0"); // Add 1 to fix timezone offset (simplistic approach for local logic)
        const month = dateObj.toLocaleString('en-US', { month: 'short' });
        const year = String(dateObj.getFullYear()).slice(-2);
        const formattedDate = `${day}/${month}/${year}`;

        const newRow: AssetEntry = {
            Date: formattedDate,
            Classification: formData.Classification,
            Asset: formData.Asset,
            Value: Number(formData.Value),
        };

        try {
            await fetch("/api/database", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "append", data: newRow }),
            });
            // Fire the event with the new data BEFORE closing
            window.dispatchEvent(new CustomEvent("asset-added", { detail: newRow }));
            // Small delay to let listeners react before unmount
            await new Promise((r) => setTimeout(r, 50));
            onClose();
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }

    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-surface border border-border rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-border flex justify-between items-center">
                    <h3 className="text-lg font-bold text-foreground">Adicionar Patrimônio</h3>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-1">Data</label>
                        <input
                            type="date"
                            name="Date"
                            required
                            value={formData.Date}
                            onChange={handleChange}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-foreground mb-1">Classificação</label>
                        <select
                            name="Classification"
                            required
                            value={formData.Classification}
                            onChange={handleChange}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                            {classifications.map((c) => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-foreground mb-1">Ativo/Instituição</label>
                        <select
                            name="Asset"
                            required
                            value={formData.Asset}
                            onChange={handleChange}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                            {assets.map((a) => (
                                <option key={a} value={a}>{a}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-foreground mb-1">Valor (R$)</label>
                        <input
                            type="number"
                            name="Value"
                            step="0.01"
                            required
                            value={formData.Value}
                            onChange={handleChange}
                            placeholder="Ex: 350000"
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>

                    <div className="pt-4 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white shadow-md hover:bg-primary/90 transition-all cursor-pointer disabled:opacity-50"
                        >
                            {loading ? "Salvando..." : "Adicionar"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
