"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { useTranslation } from "@/lib/i18n";
import { FormattedNumberInput } from "@/components/FormattedNumberInput";
import { AssetEntry } from "@/types/database";
import { AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface ProjectionsSectionProps {
    currentWealth: number;
    params: {
        monthlyAddition: string;
        annualRate: string;
        yearsToProject: string;
    };
    setParams: {
        setMonthlyAddition: (val: string) => void;
        setAnnualRate: (val: string) => void;
        setYearsToProject: (val: string) => void;
    };
}

export default function ProjectionsSection({ currentWealth, params, setParams }: ProjectionsSectionProps) {
    const { t, formatCurrency } = useTranslation();
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";

    const { monthlyAddition, annualRate, yearsToProject } = params;
    const { setMonthlyAddition, setAnnualRate, setYearsToProject } = setParams;

    // Theme-aware chart colors
    const chartGridColor = isDark ? "var(--border)" : "#e2e8f0";
    const chartTickColor = isDark ? "#64748b" : "#94a3b8";
    const tooltipBg = isDark ? "var(--surface)" : "#ffffff";
    const tooltipBorder = isDark ? "var(--border)" : "#e2e8f0";
    const tooltipLabelColor = isDark ? "#94a3b8" : "#64748b";
    const tooltipTextColor = isDark ? "var(--foreground)" : "#0f172a";
    const months = Number(yearsToProject) * 12;
    const monthlyRate = Math.pow(1 + Number(annualRate) / 100, 1 / 12) - 1;
    const monthlyPct = annualRate ? ((monthlyRate * 100).toFixed(1)) : "—";
    const addition = Number(monthlyAddition);

    const projectionData = [];
    let simulatedWealth = currentWealth;
    let totalInvested = currentWealth;

    const today = new Date();

    projectionData.push({
        month: 0,
        name: today.toLocaleString('default', { month: 'short', year: '2-digit' }),
        value: simulatedWealth,
        invested: totalInvested,
    });

    for (let i = 1; i <= months; i++) {
        simulatedWealth = simulatedWealth * (1 + monthlyRate) + addition;
        totalInvested += addition;
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
        <div className="flex flex-col gap-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-foreground">{t("projections.title")}</h1>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">
                        {t("projections.subtitle", { amount: formatCurrency(currentWealth) })}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 rounded-xl bg-surface border border-border shadow-sm p-6 flex flex-col gap-4">
                    <h3 className="text-lg font-bold text-foreground">{t("projections.parameters")}</h3>
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-1">{t("projections.monthlyAddition")}</label>
                        <FormattedNumberInput
                            value={Number(monthlyAddition) || 0}
                            onChange={n => setMonthlyAddition(String(Math.round(n)))}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-1">
                            {t("projections.annualRate")}
                            <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">
                                ({monthlyPct}% {t("projections.perMonth")})
                            </span>
                        </label>
                        <input
                            type="number"
                            step="0.1"
                            value={annualRate}
                            onChange={e => setAnnualRate(e.target.value)}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-1">{t("projections.yearsToProject")}</label>
                        <input
                            type="number"
                            value={yearsToProject}
                            onChange={e => setYearsToProject(e.target.value)}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>
                    <div className="mt-4 pt-4 border-t border-border">
                        <p className="text-sm text-slate-500 dark:text-slate-400">{t("projections.finalResult", { years: yearsToProject })}</p>
                        <h3 className="text-3xl font-bold text-primary mt-1 tracking-tight">
                            {formatCurrency(simulatedWealth)}
                        </h3>
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-2">
                            {t("projections.totalInvested", { amount: formatCurrency(totalInvested) })}
                        </p>
                        <p className="text-sm font-medium text-green-600 dark:text-green-400">
                            {t("projections.interestEarned", { amount: formatCurrency(simulatedWealth - totalInvested) })}
                        </p>
                    </div>
                </div>

                <div className="lg:col-span-2 rounded-xl bg-surface border border-border shadow-sm p-6 flex flex-col">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="text-lg font-bold text-foreground">{t("projections.projectedGrowth")}</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">{t("projections.compoundInterest")}</p>
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
                                    formatter={(value: any, name: any) => [formatCurrency(value as number), name === "value" ? t("dashboard.wealth") : t("projections.invested")]}
                                    contentStyle={{ borderRadius: '8px', border: `1px solid ${tooltipBorder}`, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.2)', backgroundColor: tooltipBg, color: tooltipTextColor }}
                                    labelStyle={{ color: tooltipLabelColor }}
                                />
                                <Area type="monotone" dataKey="invested" stroke="#94a3b8" strokeWidth={2} fillOpacity={1} fill="url(#colorInvested)" />
                                <Area type="monotone" dataKey="value" stroke="#137fec" strokeWidth={3} fillOpacity={1} fill="url(#colorValueProj)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
}
