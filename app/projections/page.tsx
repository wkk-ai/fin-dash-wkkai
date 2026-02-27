"use client";

import { useEffect, useState } from "react";
import { AssetEntry } from "@/types/database";
import { parseCustomDate, formatCurrency } from "@/lib/utils";
import { AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export default function Projections() {
    const [data, setData] = useState<AssetEntry[]>([]);
    const [loading, setLoading] = useState(true);

    // Projection settings
    const [monthlyAddition, setMonthlyAddition] = useState<string>("5000");
    const [monthlyRate, setMonthlyRate] = useState<string>("0.8");
    const [yearsToProject, setYearsToProject] = useState<string>("10");

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

    // Find latest net worth
    let currentWealth = 0;
    if (data.length > 0) {
        const dateValues: Record<string, number> = {};
        const dateObjects: Record<string, Date> = {};

        data.forEach((entry) => {
            if (!dateValues[entry.Date]) {
                dateValues[entry.Date] = 0;
                dateObjects[entry.Date] = parseCustomDate(entry.Date);
            }
            dateValues[entry.Date] += entry.Value;
        });

        const uniqueDates = Object.keys(dateValues).sort((a, b) => dateObjects[a].getTime() - dateObjects[b].getTime());
        const latestDateStr = uniqueDates[uniqueDates.length - 1];
        currentWealth = dateValues[latestDateStr] || 0;
    }

    // Calculate Projection
    const months = Number(yearsToProject) * 12;
    const rate = Number(monthlyRate) / 100;
    const addition = Number(monthlyAddition);

    const projectionData = [];
    let simulatedWealth = currentWealth;
    let totalInvested = currentWealth;

    const today = new Date();

    // Push month 0
    projectionData.push({
        month: 0,
        name: today.toLocaleString('default', { month: 'short', year: '2-digit' }),
        value: simulatedWealth,
        invested: totalInvested,
    });

    for (let i = 1; i <= months; i++) {
        simulatedWealth = simulatedWealth * (1 + rate) + addition;
        totalInvested += addition;

        // Save data point every 12 months or the very first months for granularity
        if (i % 12 === 0 || i <= 12) {
            const futureDate = new Date(today.getFullYear(), today.getMonth() + i, 1);
            projectionData.push({
                month: i,
                name: futureDate.toLocaleString('default', { month: 'short', year: '2-digit' }),
                value: simulatedWealth,
                invested: totalInvested,
            });
        }
    }

    return (
        <div className="mx-auto max-w-7xl flex flex-col gap-8">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 animate-in slide-in-from-bottom-2 fade-in duration-500">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Projeções Financeiras</h1>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">
                        Simule o crescimento do seu patrimônio atual ({formatCurrency(currentWealth)})
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in slide-in-from-bottom-4 fade-in duration-700">

                {/* Settings Panel */}
                <div className="lg:col-span-1 rounded-xl bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark shadow-sm p-6 flex flex-col gap-4">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">Parâmetros</h3>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Aporte Mensal (R$)</label>
                        <input
                            type="number"
                            value={monthlyAddition}
                            onChange={e => setMonthlyAddition(e.target.value)}
                            className="w-full rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Taxa de Juros Mensal (%)</label>
                        <input
                            type="number"
                            step="0.1"
                            value={monthlyRate}
                            onChange={e => setMonthlyRate(e.target.value)}
                            className="w-full rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Anos para Projetar</label>
                        <input
                            type="number"
                            value={yearsToProject}
                            onChange={e => setYearsToProject(e.target.value)}
                            className="w-full rounded-lg border border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>

                    <div className="mt-4 pt-4 border-t border-border-light dark:border-border-dark">
                        <p className="text-sm text-slate-500 dark:text-slate-400">Resultado Final ({yearsToProject} anos):</p>
                        <h3 className="text-3xl font-bold text-primary mt-1 tracking-tight">
                            {formatCurrency(simulatedWealth)}
                        </h3>
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-2">
                            Total Investido: {formatCurrency(totalInvested)}
                        </p>
                        <p className="text-sm font-medium text-green-600 dark:text-green-400">
                            Juros Ganhos: {formatCurrency(simulatedWealth - totalInvested)}
                        </p>
                    </div>
                </div>

                {/* Chart Panel */}
                <div className="lg:col-span-2 rounded-xl bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark shadow-sm p-6 flex flex-col">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Crescimento Projetado</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Juros Compostos + Aportes Mensais</p>
                        </div>
                    </div>
                    <div className="flex-1 min-h-[350px] w-full relative">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={projectionData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorValueProj" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#137fec" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#137fec" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorInvested" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:stroke-slate-700/50" />
                                <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} tickMargin={10} stroke="#94a3b8" />
                                <YAxis
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                                    stroke="#94a3b8"
                                />
                                <RechartsTooltip
                                    formatter={(value: any, name: any) => [formatCurrency(value as number), name === "value" ? "Patrimônio" : "Investido"]}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    labelStyle={{ color: '#64748b' }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="invested"
                                    stroke="#94a3b8"
                                    strokeWidth={2}
                                    fillOpacity={1}
                                    fill="url(#colorInvested)"
                                />
                                <Area
                                    type="monotone"
                                    dataKey="value"
                                    stroke="#137fec"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorValueProj)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

            </div>
        </div>
    );
}
