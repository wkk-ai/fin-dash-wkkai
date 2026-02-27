"use client";

import { useEffect, useState } from "react";
import { AssetEntry } from "@/types/database";
import { parseCustomDate, formatCurrency } from "@/lib/utils";

export default function Portfolio() {
    const [data, setData] = useState<AssetEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/database")
            .then((res) => res.json())
            .then((json: AssetEntry[]) => {
                setData(json);
                setLoading(false);
            })
            .catch((err) => {
                console.error("Failed to load data", err);
                setLoading(false);
            });
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    // Determine latest date to show only current portfolio
    let latestDateStr = "";
    if (data.length > 0) {
        const dates = Array.from(new Set(data.map(d => d.Date)));
        dates.sort((a, b) => parseCustomDate(a).getTime() - parseCustomDate(b).getTime());
        latestDateStr = dates[dates.length - 1];
    }

    const currentAssets = data.filter(d => d.Date === latestDateStr);
    const totalWealth = currentAssets.reduce((sum, item) => sum + item.Value, 0);

    // Group by classification
    const grouped: Record<string, AssetEntry[]> = {};
    currentAssets.forEach((asset) => {
        if (!grouped[asset.Classification]) {
            grouped[asset.Classification] = [];
        }
        grouped[asset.Classification].push(asset);
    });

    return (
        <div className="mx-auto max-w-7xl flex flex-col gap-8">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 animate-in slide-in-from-bottom-2 fade-in duration-500">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Minha Carteira</h1>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">
                        Visualização detalhada dos seus ativos em {latestDateStr}
                    </p>
                </div>
                <div className="flex bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark px-4 py-2 rounded-xl shadow-sm items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg text-primary">
                        <span className="material-symbols-outlined text-[20px]">account_balance_wallet</span>
                    </div>
                    <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Total Atual</p>
                        <p className="text-lg font-bold text-slate-900 dark:text-white leading-none">
                            {formatCurrency(totalWealth)}
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-4 fade-in duration-700">
                {Object.keys(grouped).length === 0 ? (
                    <div className="text-center py-20 text-slate-500 border border-dashed border-border-light dark:border-border-dark rounded-xl">
                        Nenhum ativo encontrado no último mês.
                    </div>
                ) : (
                    Object.entries(grouped).map(([classification, assets]) => {
                        const classTotal = assets.reduce((sum, item) => sum + item.Value, 0);
                        const classPercentage = totalWealth > 0 ? (classTotal / totalWealth) * 100 : 0;

                        return (
                            <div key={classification} className="rounded-xl bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark shadow-sm overflow-hidden">
                                <div className="px-6 py-4 border-b border-border-light dark:border-border-dark flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-background-light/50 dark:bg-background-dark/20">
                                    <div className="flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary text-[20px]">category</span>
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">{classification}</h3>
                                    </div>
                                    <div className="flex items-center gap-4 text-sm">
                                        <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(classTotal)}</span>
                                        <span className="px-2 py-0.5 rounded-full bg-border-light dark:bg-border-dark text-slate-600 dark:text-slate-300 text-xs font-semibold">
                                            {classPercentage.toFixed(1)}% da carteira
                                        </span>
                                    </div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-surface-light dark:bg-surface-dark text-xs uppercase text-slate-500 font-bold tracking-wider">
                                                <th className="px-6 py-3">Ativo/Instituição</th>
                                                <th className="px-6 py-3 text-right">Valor Atual</th>
                                                <th className="px-6 py-3 text-right">Peso na Categoria</th>
                                                <th className="px-6 py-3 text-right">Peso Total</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border-light dark:divide-border-dark text-sm">
                                            {assets.sort((a, b) => b.Value - a.Value).map((asset, idx) => {
                                                const weightInClass = classTotal > 0 ? (asset.Value / classTotal) * 100 : 0;
                                                const weightInTotal = totalWealth > 0 ? (asset.Value / totalWealth) * 100 : 0;

                                                return (
                                                    <tr key={`${asset.Asset}-${idx}`} className="hover:bg-background-light dark:hover:bg-white/5 transition-colors group">
                                                        <td className="px-6 py-4 font-medium text-slate-900 dark:text-white flex items-center gap-3">
                                                            <div className="size-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 font-bold border border-border-light dark:border-border-dark shadow-sm group-hover:bg-primary group-hover:text-white transition-colors">
                                                                {asset.Asset.charAt(0).toUpperCase()}
                                                            </div>
                                                            {asset.Asset}
                                                        </td>
                                                        <td className="px-6 py-4 text-right font-medium text-slate-900 dark:text-white">
                                                            {formatCurrency(asset.Value)}
                                                        </td>
                                                        <td className="px-6 py-4 text-right text-slate-500 dark:text-slate-400">
                                                            {weightInClass.toFixed(1)}%
                                                        </td>
                                                        <td className="px-6 py-4 text-right text-slate-500 dark:text-slate-400">
                                                            {weightInTotal.toFixed(1)}%
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
