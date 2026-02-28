"use client";

import { useTheme } from "next-themes";
import { AssetEntry } from "@/types/database";
import { formatCurrency } from "@/lib/utils";
import { AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from "recharts";

interface DashboardSectionProps {
    data: AssetEntry[];
    uniqueDates: string[];
    dateValues: Record<string, number>;
    dateObjects: Record<string, Date>;
    projectionResult: number;
    projectionParams: {
        monthlyAddition: number;
        monthlyRate: number;
        years: number;
    };
}

export default function DashboardSection({ data, uniqueDates, dateValues, dateObjects, projectionResult, projectionParams }: DashboardSectionProps) {
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";

    // Theme-aware chart colors
    const chartGridColor = isDark ? "var(--border)" : "#e2e8f0";
    const chartTickColor = isDark ? "#64748b" : "#94a3b8";
    const tooltipBg = isDark ? "var(--surface)" : "#ffffff";
    const tooltipBorder = isDark ? "var(--border)" : "#e2e8f0";
    const tooltipLabelColor = isDark ? "#94a3b8" : "#64748b";
    const tooltipTextColor = isDark ? "var(--foreground)" : "#0f172a";

    // Wealth Evolution history for chart
    const wealthHistory = uniqueDates.map(dateStr => ({
        name: dateObjects[dateStr].toLocaleString('default', { month: 'short', year: '2-digit' }),
        value: dateValues[dateStr]
    }));

    // Latest stats
    const latestDateStr = uniqueDates[uniqueDates.length - 1];
    const prevDateStr = uniqueDates.length > 1 ? uniqueDates[uniqueDates.length - 2] : null;

    const currentWealth = dateValues[latestDateStr] || 0;
    const prevWealth = prevDateStr ? dateValues[prevDateStr] : 0;

    const momVariation = currentWealth - prevWealth;
    const momGrowthRate = prevWealth !== 0 ? (momVariation / prevWealth) * 100 : 0;
    const isPositiveGrowth = momVariation >= 0;

    // Asset Allocation (from the latest month)
    const currentAssets = data.filter(d => d.Date === latestDateStr);
    const allocationMap: Record<string, number> = {};
    currentAssets.forEach(a => {
        allocationMap[a.Classification] = (allocationMap[a.Classification] || 0) + a.Value;
    });

    const allocationChartData = Object.entries(allocationMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    const COLORS = ['#137fec', '#a855f7', '#34d399', '#f59e0b', '#ef4444', '#ec4899', '#6366f1'];

    return (
        <div className="flex flex-col gap-8">
            {/* Welcome Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Bem-vindo de volta</p>
                    <h1 className="text-3xl font-bold text-foreground">Panorama Financeiro</h1>
                </div>
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium px-2 py-1.5 rounded bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20 flex items-center gap-1 leading-none h-8">
                        <span className="material-symbols-outlined text-[14px]">trending_up</span> Mercado Aberto
                    </span>
                    <span className="text-xs font-medium px-3 py-1.5 rounded bg-border text-slate-500 dark:text-slate-400 border border-transparent flex items-center justify-center leading-none h-8 min-w-[120px]">
                        Última atu.: {latestDateStr}
                    </span>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Card 1: Total Wealth */}
                <div className="group relative overflow-hidden rounded-xl bg-surface p-6 shadow-sm border border-border hover:border-primary/50 transition-all">
                    <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <span className="material-symbols-outlined text-8xl">account_balance_wallet</span>
                    </div>
                    <div className="flex flex-col gap-1 relative z-10">
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Patrimônio Total</p>
                        <div className="flex items-baseline gap-2">
                            <h3 className="text-3xl font-bold text-foreground tracking-tight">{formatCurrency(currentWealth)}</h3>
                        </div>
                        {prevWealth > 0 && (
                            <div className={`mt-2 flex items-center gap-1 text-sm font-medium ${isPositiveGrowth ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                                <span className="material-symbols-outlined text-[18px]">
                                    {isPositiveGrowth ? 'arrow_upward' : 'arrow_downward'}
                                </span>
                                <span>{Math.abs(momGrowthRate).toFixed(1)}%</span>
                                <span className="text-slate-400 dark:text-slate-500 font-normal ml-1">vs mês passado</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Card 2: Variation */}
                <div className="group relative overflow-hidden rounded-xl bg-surface p-6 shadow-sm border border-border hover:border-primary/50 transition-all">
                    <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <span className="material-symbols-outlined text-8xl">show_chart</span>
                    </div>
                    <div className="flex flex-col gap-1 relative z-10">
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Variação Mensal</p>
                        <div className="flex items-baseline gap-2">
                            <h3 className="text-3xl font-bold text-foreground tracking-tight">
                                {isPositiveGrowth ? '+' : ''}{formatCurrency(momVariation)}
                            </h3>
                        </div>
                        <div className={`mt-2 flex items-center gap-1 text-sm font-medium ${isPositiveGrowth ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                            <span className="material-symbols-outlined text-[18px]">
                                {isPositiveGrowth ? 'trending_up' : 'trending_down'}
                            </span>
                            <span>{Math.abs(momGrowthRate).toFixed(1)}%</span>
                            <span className="text-slate-400 dark:text-slate-500 font-normal ml-1">evolução</span>
                        </div>
                    </div>
                </div>

                {/* Card 3: Projection */}
                <div className="group relative overflow-hidden rounded-xl bg-surface p-6 shadow-sm border border-border hover:border-primary/50 transition-all">
                    <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <span className="material-symbols-outlined text-8xl">rocket_launch</span>
                    </div>
                    <div className="flex flex-col gap-1 relative z-10">
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400 line-clamp-2 pr-8">
                            Valor projetado p/ {projectionParams.years} anos c/ {projectionParams.monthlyRate}% a.m. e aportes de R$ {(projectionParams.monthlyAddition / 1000).toFixed(0)}k
                        </p>
                        <div className="flex items-baseline gap-2">
                            <h3 className="text-3xl font-bold text-primary tracking-tight">{formatCurrency(projectionResult)}</h3>
                        </div>
                        <div className="mt-2 flex items-center gap-1 text-sm font-medium text-slate-400 dark:text-slate-500">
                            <span className="material-symbols-outlined text-[18px]">update</span>
                            <span>Simulação dinâmica</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 rounded-xl bg-surface border border-border shadow-sm p-6 flex flex-col">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="text-lg font-bold text-foreground">Evolução do Patrimônio</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Valor ao longo do tempo</p>
                        </div>
                    </div>
                    <div className="flex-1 min-h-[300px] w-full relative">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={wealthHistory} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#137fec" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#137fec" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartGridColor} />
                                <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} tickMargin={10} stroke={chartTickColor} />
                                <YAxis
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                                    stroke={chartTickColor}
                                />
                                <RechartsTooltip
                                    formatter={(value: any) => [formatCurrency(value as number), "Patrimônio"]}
                                    contentStyle={{ borderRadius: '8px', border: `1px solid ${tooltipBorder}`, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.2)', backgroundColor: tooltipBg, color: tooltipTextColor }}
                                    labelStyle={{ color: tooltipLabelColor }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="value"
                                    stroke="#137fec"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorValue)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="rounded-xl bg-surface border border-border shadow-sm p-6 flex flex-col">
                    <h3 className="text-lg font-bold text-foreground mb-1">Alocação Atual</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Distribuição em {latestDateStr}</p>

                    <div className="flex-1 min-h-[200px] w-full relative -mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={allocationChartData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={2}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {allocationChartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <RechartsTooltip
                                    formatter={(value: any) => formatCurrency(value as number)}
                                    contentStyle={{ borderRadius: '8px', border: `1px solid ${tooltipBorder}`, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.2)', backgroundColor: tooltipBg, color: tooltipTextColor }}
                                    labelStyle={{ color: tooltipLabelColor }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-2">
                            <span className="text-xl font-bold text-foreground">
                                ${(currentWealth / 1000).toFixed(1)}k
                            </span>
                            <span className="text-xs text-slate-500">Total</span>
                        </div>
                    </div>

                    <div className="mt-4 space-y-3">
                        {allocationChartData.map((entry, index) => {
                            const percentage = ((entry.value / currentWealth) * 100).toFixed(1);
                            return (
                                <div key={entry.name} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="size-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                                        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{entry.name}</span>
                                    </div>
                                    <span className="text-sm font-bold text-foreground">{percentage}%</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
