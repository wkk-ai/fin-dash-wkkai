"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { useTranslation } from "@/lib/i18n";
import { AssetEntry } from "@/types/database";
import { AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, ReferenceArea } from "recharts";
import { useChartBrush } from "@/lib/useChartBrush";
import { fetchMarketData } from "@/lib/supabase-data";

interface DashboardSectionProps {
    data: AssetEntry[];
    uniqueDates: string[];
    dateValues: Record<string, number>;
    dateObjects: Record<string, Date>;
    projectionResult: number;
    projectionParams: {
        monthlyAddition: number;
        annualRate: number;
        years: number;
    };
}

export default function DashboardSection({ data, uniqueDates, dateValues, dateObjects, projectionResult, projectionParams }: DashboardSectionProps) {
    const { t, formatCurrency } = useTranslation();
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
    const previousAssets = prevDateStr ? data.filter(d => d.Date === prevDateStr) : [];
    const allocationMap: Record<string, number> = {};
    currentAssets.forEach(a => {
        allocationMap[a.Classification] = (allocationMap[a.Classification] || 0) + a.Value;
    });

    const allocationChartData = Object.entries(allocationMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    const COLORS = ['#137fec', '#a855f7', '#34d399', '#f59e0b', '#ef4444', '#ec4899', '#6366f1'];

    const topAsset = [...currentAssets].sort((a, b) => b.Value - a.Value)[0];
    const topAssetPct = currentWealth > 0 && topAsset ? (topAsset.Value / currentWealth) * 100 : 0;

    const nextMillionBase = Math.floor(currentWealth / 1_000_000) * 1_000_000;
    const nextMillion = (currentWealth % 1_000_000 === 0 ? nextMillionBase + 1_000_000 : nextMillionBase + 1_000_000);
    const toNextMillion = Math.max(0, nextMillion - currentWealth);
    const monthsToNextMillion = momVariation > 0 ? Math.ceil(toNextMillion / momVariation) : null;

    const latestByAsset: Record<string, number> = {};
    const prevByAsset: Record<string, number> = {};
    currentAssets.forEach((a) => {
        latestByAsset[a.Asset] = (latestByAsset[a.Asset] || 0) + a.Value;
    });
    previousAssets.forEach((a) => {
        prevByAsset[a.Asset] = (prevByAsset[a.Asset] || 0) + a.Value;
    });

    const assetGrowth = Object.keys(latestByAsset)
        .filter((asset) => (prevByAsset[asset] || 0) > 0)
        .map((asset) => ({
            asset,
            pct: ((latestByAsset[asset] - prevByAsset[asset]) / prevByAsset[asset]) * 100,
        }));
    const topGainer = [...assetGrowth].sort((a, b) => b.pct - a.pct)[0];
    const topLoser = [...assetGrowth].sort((a, b) => a.pct - b.pct)[0];
    const topGainerFullLabel = topGainer?.asset || "—";
    const topLoserFullLabel = topLoser?.asset || "—";
    const [shouldAbbreviateAssets, setShouldAbbreviateAssets] = useState(false);
    const variationLineRef = useRef<HTMLDivElement>(null);
    const variationProbeRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const measureOverflow = () => {
            if (!variationLineRef.current || !variationProbeRef.current) return;
            setShouldAbbreviateAssets(
                variationProbeRef.current.scrollWidth > variationLineRef.current.clientWidth
            );
        };

        measureOverflow();
        window.addEventListener("resize", measureOverflow);
        return () => window.removeEventListener("resize", measureOverflow);
    }, [topGainerFullLabel, topLoserFullLabel]);

    const abbreviateAssetName = (name: string) =>
        name !== "—" && name.length > 5 ? `${name.slice(0, 5)}.` : name;
    const topGainerLabel = shouldAbbreviateAssets ? abbreviateAssetName(topGainerFullLabel) : topGainerFullLabel;
    const topLoserLabel = shouldAbbreviateAssets ? abbreviateAssetName(topLoserFullLabel) : topLoserFullLabel;

    const wealthBrush = useChartBrush(wealthHistory, "value");

    const [marketData, setMarketData] = useState<{ selic: string | null; ipca: string | null } | null>(null);

    useEffect(() => {
        fetchMarketData()
            .then(data => {
                setMarketData({ selic: data.selic, ipca: data.ipca });
            })
            .catch(err => console.error("Error fetching market data:", err));
    }, []);

    return (
        <div className="flex flex-col gap-8">
            {/* Welcome Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{t("dashboard.welcome")}</p>
                    <h1 className="text-3xl font-bold text-foreground">{t("dashboard.title")}</h1>
                </div>
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium px-2 py-1.5 rounded bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20 flex items-center gap-1 leading-none h-8">
                        <span className="material-symbols-outlined text-[14px]">trending_up</span> {t("dashboard.marketOpen")}
                    </span>

                    {marketData && (
                        <>
                            <div className="flex items-center gap-3 px-3 py-1.5 rounded bg-surface border border-border h-8">
                                <div className="flex items-center gap-1.5 pt-[1px]">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t("dashboard.selic")}</span>
                                    <span className="text-xs font-bold text-primary">{marketData.selic}%</span>
                                </div>
                                <div className="w-[1px] h-3 bg-border" />
                                <div className="flex items-center gap-1.5 pt-[1px]">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t("dashboard.ipca")}</span>
                                    <span className="text-xs font-bold text-primary">{marketData.ipca}%</span>
                                </div>
                            </div>
                        </>
                    )}

                    <span className="text-xs font-medium px-3 py-1.5 rounded bg-border text-slate-500 dark:text-slate-400 border border-transparent flex items-center justify-center leading-none h-8 min-w-[120px]">
                        {t("dashboard.lastUpdate", { date: latestDateStr })}
                    </span>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Card 1: Total Wealth */}
                <div className="group relative overflow-hidden rounded-xl bg-surface p-6 shadow-sm border border-border hover:border-primary/50 transition-all">
                    <div className="absolute right-0 top-0 p-4 opacity-20 group-hover:opacity-35 transition-opacity text-primary">
                        <span className="material-symbols-outlined text-8xl">account_balance_wallet</span>
                    </div>
                    <div className="flex flex-col gap-1 relative z-10">
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{t("dashboard.totalWealth")}</p>
                        <div className="flex items-baseline gap-2">
                            <h3 className="text-3xl font-bold text-foreground tracking-tight">{formatCurrency(currentWealth)}</h3>
                        </div>
                        {topAsset && (
                            <div className="mt-2 flex items-center gap-1 text-sm font-medium text-primary">
                                <span className="text-slate-500 dark:text-slate-400 font-normal">
                                    {t("dashboard.topAssetLabel")}:
                                </span>
                                <span>{topAssetPct.toFixed(1)}% {topAsset.Asset}</span>
                            </div>
                        )}
                        <div className="mt-2 flex items-center gap-1 text-sm font-medium text-slate-600 dark:text-slate-400">
                            <span className="material-symbols-outlined text-[18px]">schedule</span>
                            <span>
                                {t("dashboard.monthsToNextMillion")}:{" "}
                                <span className="font-bold">{monthsToNextMillion === null ? "—" : monthsToNextMillion}</span>
                            </span>
                        </div>
                    </div>
                </div>

                {/* Card 2: Variation */}
                <div className="group relative overflow-hidden rounded-xl bg-surface p-6 shadow-sm border border-border hover:border-primary/50 transition-all">
                    <div className="absolute right-0 top-0 p-4 opacity-20 group-hover:opacity-35 transition-opacity text-primary">
                        <span className="material-symbols-outlined text-8xl">show_chart</span>
                    </div>
                    <div className="flex flex-col gap-1 relative z-10">
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{t("dashboard.monthlyVariation")}</p>
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
                            <span className="text-slate-400 dark:text-slate-500 font-normal ml-1">{t("dashboard.vsLastMonth")}</span>
                        </div>
                        <div ref={variationLineRef} className="relative mt-2 w-full">
                            <div
                                ref={variationProbeRef}
                                className="absolute invisible pointer-events-none whitespace-nowrap text-sm font-medium"
                            >
                                <span className={topGainer && topGainer.pct >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}>
                                    {topGainer && topGainer.pct >= 0 ? "+" : ""}{topGainer?.pct.toFixed(1)}%
                                </span>
                                <span className="ml-1">{topGainerFullLabel}</span>
                                <span className="mx-2">|</span>
                                <span className={topLoser && topLoser.pct >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}>
                                    {topLoser && topLoser.pct >= 0 ? "+" : ""}{topLoser?.pct.toFixed(1)}%
                                </span>
                                <span className="ml-1">{topLoserFullLabel}</span>
                            </div>
                            <div className="text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1.5 whitespace-nowrap">
                                <span className={topGainer && topGainer.pct >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}>
                                    {topGainer && topGainer.pct >= 0 ? "+" : ""}{topGainer?.pct.toFixed(1)}%
                                </span>
                                <span>{topGainerLabel}</span>
                                <span className="mx-2">|</span>
                                <span className={topLoser && topLoser.pct >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}>
                                    {topLoser && topLoser.pct >= 0 ? "+" : ""}{topLoser?.pct.toFixed(1)}%
                                </span>
                                <span>{topLoserLabel}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Card 3: Projection */}
                <div className="group relative overflow-hidden rounded-xl bg-surface p-6 shadow-sm border border-border hover:border-primary/50 transition-all">
                    <div className="absolute right-0 top-0 p-4 opacity-20 group-hover:opacity-35 transition-opacity text-primary">
                        <span className="material-symbols-outlined text-8xl">rocket_launch</span>
                    </div>
                    <div className="flex flex-col gap-1 relative z-10">
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400 line-clamp-2 pr-8">
                            {t("dashboard.projectedLabel", {
                                years: projectionParams.years,
                                rate: projectionParams.annualRate,
                                addition: (projectionParams.monthlyAddition / 1000).toFixed(0)
                            })}
                        </p>
                        <div className="flex items-baseline gap-2">
                            <h3 className="text-3xl font-bold text-primary tracking-tight">{formatCurrency(projectionResult)}</h3>
                        </div>
                        <div className="mt-2 flex items-center gap-1 text-sm font-medium text-slate-400 dark:text-slate-500">
                            <span className="material-symbols-outlined text-[18px]">update</span>
                            <span>{t("dashboard.dynamicSimulation")}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 rounded-xl bg-surface border border-border shadow-sm p-6 flex flex-col">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="text-lg font-bold text-foreground">{t("dashboard.wealthEvolution")}</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">{t("dashboard.valueOverTime")}</p>
                        </div>
                    </div>
                    <div
                        className="flex-1 min-h-[300px] w-full relative cursor-crosshair select-none"
                        {...wealthBrush.containerHandlers}
                    >
                        {wealthBrush.variation && (
                            <div
                                className="absolute top-3 left-1/2 -translate-x-1/2 z-10 rounded-lg px-3 py-2 border shadow text-sm font-medium pointer-events-none"
                                style={{
                                    borderRadius: "8px",
                                    border: `1px solid ${tooltipBorder}`,
                                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.2)",
                                    backgroundColor: tooltipBg,
                                }}
                            >
                                <span style={{ color: tooltipLabelColor }}>{t("dashboard.periodVariation")}: </span>
                                <span style={{ color: wealthBrush.variation.absolute >= 0 ? "#22c55e" : "#ef4444" }}>
                                    {formatCurrency(wealthBrush.variation.absolute)} ({wealthBrush.variation.percent >= 0 ? "+" : ""}{wealthBrush.variation.percent.toFixed(1)}%)
                                </span>
                            </div>
                        )}
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart
                                data={wealthHistory}
                                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                                {...wealthBrush.chartHandlers}
                            >
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
                                    cursor={false}
                                    content={({ active, payload }) => (wealthBrush.isDragging ? null : active && payload?.length ? (
                                        <div className="rounded-lg px-3 py-2 border shadow" style={{ backgroundColor: tooltipBg, borderColor: tooltipBorder, boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.2)", color: tooltipTextColor }}>
                                            <p style={{ color: tooltipLabelColor }}>{payload[0].payload?.name}</p>
                                            <p>{t("dashboard.wealth")}: {formatCurrency(payload[0].value as number)}</p>
                                        </div>
                                    ) : null)}
                                    wrapperStyle={{ zIndex: 9999 }}
                                />
                                {wealthBrush.selectionBounds && wealthHistory[wealthBrush.selectionBounds[0]] && wealthHistory[wealthBrush.selectionBounds[1]] && (
                                    <ReferenceArea
                                        x1={wealthHistory[wealthBrush.selectionBounds[0]].name}
                                        x2={wealthHistory[wealthBrush.selectionBounds[1]].name}
                                        fill="#137fec"
                                        fillOpacity={0.15}
                                        strokeOpacity={0}
                                    />
                                )}
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
                    <h3 className="text-lg font-bold text-foreground mb-1">{t("dashboard.currentAllocation")}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{t("dashboard.distributionIn", { date: latestDateStr })}</p>

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
                                    content={({ active, payload }) => {
                                        if (!active || !payload?.length) return null;
                                        const { name, value } = payload[0].payload;
                                        const idx = allocationChartData.findIndex((d) => d.name === name);
                                        const segmentColor = idx >= 0 ? COLORS[idx % COLORS.length] : tooltipTextColor;
                                        return (
                                            <div
                                                className="rounded-lg px-3 py-2 shadow-lg border"
                                                style={{
                                                    zIndex: 9999,
                                                    backgroundColor: tooltipBg,
                                                    borderColor: tooltipBorder,
                                                    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.2)",
                                                }}
                                            >
                                                <span style={{ color: segmentColor, fontWeight: 600 }}>{name}</span>
                                                <span style={{ color: tooltipTextColor }}> : {formatCurrency(value)}</span>
                                            </div>
                                        );
                                    }}
                                    wrapperStyle={{ zIndex: 9999 }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-2">
                            <span className="text-xl font-bold text-foreground">
                                ${(currentWealth / 1000).toFixed(1)}k
                            </span>
                            <span className="text-xs text-slate-500">{t("dashboard.total")}</span>
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
