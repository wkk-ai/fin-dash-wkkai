"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useTranslation } from "@/lib/i18n";
import { MovementEntry, BudgetEntry } from "@/types/database";
import { parseCustomDate } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, PieChart, Pie, AreaChart, Area } from "recharts";
import MovementsTable from "@/components/MovementsTable";
import DailyTrackingChart from "@/components/DailyTrackingChart";

export default function MovementsPage() {
    const { t, formatCurrency } = useTranslation();
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";

    const [movements, setMovements] = useState<MovementEntry[]>([]);
    const [budgets, setBudgets] = useState<BudgetEntry[]>([]);
    const [settings, setSettings] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const tooltipBg = isDark ? "var(--surface)" : "#ffffff";
    const tooltipBorder = isDark ? "var(--border)" : "#e2e8f0";
    const tooltipLabelColor = isDark ? "#94a3b8" : "#64748b";
    const tooltipTextColor = isDark ? "var(--foreground)" : "#0f172a";

    const fetchData = async () => {
        try {
            const res = await fetch("/api/movements");
            const data = await res.json();
            setMovements(data.movements || []);
            setBudgets(data.budgets || []);

            const settingsRes = await fetch("/api/settings");
            const settingsData = await settingsRes.json();
            setSettings(settingsData);
        } catch (error) {
            console.error("Error fetching movements:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        window.addEventListener("movement-added", fetchData);
        return () => window.removeEventListener("movement-added", fetchData);
    }, []);

    // Process Data for KPIs
    // Identify the latest month in the data
    const getLatestDate = () => {
        if (movements.length === 0) return new Date();
        const dates = movements.map(m => parseCustomDate(m.Date));
        return new Date(Math.max(...dates.map(d => d.getTime())));
    };

    const latestDate = getLatestDate();
    const currentMonth = latestDate.toLocaleString('en-US', { month: 'short' });
    const currentYear = String(latestDate.getFullYear()).slice(-2);

    const prevMonthDate = new Date(latestDate.getFullYear(), latestDate.getMonth() - 1, 1);
    const prevMonth = prevMonthDate.toLocaleString('en-US', { month: 'short' });
    const prevYear = String(prevMonthDate.getFullYear()).slice(-2);

    const matchMonth = (dateStr: string, m: string, y: string) => {
        const parts = dateStr.split('/'); // DD/MMM/YY
        const monthPart = parts[1]?.replace(".", "")?.toLowerCase() || "";
        const targetMonth = m.toLowerCase().replace(".", "");
        return monthPart === targetMonth && parts[2] === y;
    };

    const currentMovements = movements.filter(m => matchMonth(m.Date, currentMonth, currentYear));
    const previousMovements = movements.filter(m => matchMonth(m.Date, prevMonth, prevYear));

    const getTotals = (list: MovementEntry[]) => {
        const income = list.filter(m => m.Type === "Income").reduce((acc, m) => acc + m.Value, 0);
        // Sum expenses and take absolute value to get a positive total for comparison
        const expenses = Math.abs(list.filter(m => m.Type === "Expense").reduce((acc, m) => acc + m.Value, 0));
        return { income, expenses, net: income - expenses };
    };

    const curr = getTotals(currentMovements);
    const prev = getTotals(previousMovements);

    const calcVar = (c: number, p: number) => {
        const current = Math.abs(c);
        const previous = Math.abs(p);
        return previous > 0 ? ((current - previous) / previous) * 100 : 0;
    };

    const incomeVar = calcVar(curr.income, prev.income);
    const expenseVar = calcVar(curr.expenses, prev.expenses);
    const savingsRate = curr.income > 0 ? (curr.net / curr.income) * 100 : 0;
    const prevSavingsRate = prev.income > 0 ? (prev.net / prev.income) * 100 : 0;
    const savingsVar = savingsRate - prevSavingsRate;

    // Process Data for Income vs Expenses Bar Chart (aggregated by Month/Year)
    const aggregatedByMonth: Record<string, { monthYear: string, income: number, expense: number, sortKey: string }> = {};
    movements.forEach(m => {
        const parts = m.Date.split('/'); // DD/MMM/YY
        const monthYear = parts[1] + '/' + parts[2]; // MMM/YY

        // Create a sort key based on YY/MM format
        const monthMap: Record<string, string> = {
            'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06',
            'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
        };
        const monthNum = monthMap[parts[1].toLowerCase().replace(".", "")] || "00";
        const sortKey = parts[2] + monthNum;

        if (!aggregatedByMonth[monthYear]) {
            aggregatedByMonth[monthYear] = { monthYear, income: 0, expense: 0, sortKey };
        }
        if (m.Type === "Income") aggregatedByMonth[monthYear].income += m.Value;
        else aggregatedByMonth[monthYear].expense += Math.abs(m.Value);
    });
    const barChartData = Object.values(aggregatedByMonth)
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
        .map(d => ({ date: d.monthYear, income: d.income, expense: d.expense }))
        .slice(-12); // Show last 12 months

    // Process Data for Spending by Category (Donut)
    const categoryAgg: Record<string, number> = {};
    currentMovements.filter(m => m.Type === "Expense").forEach(m => {
        categoryAgg[m.Category] = (categoryAgg[m.Category] || 0) + Math.abs(m.Value);
    });

    const sortedAgg = Object.entries(categoryAgg)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

    const topCategories = sortedAgg.slice(0, 6);
    const othersValue = sortedAgg.slice(6).reduce((acc, curr) => acc + curr.value, 0);

    const donutData = [...topCategories];
    if (othersValue > 0) {
        donutData.push({ name: t("movements.others") || "Outros", value: othersValue });
    }

    // Colors: Largest is dark red, others are lighter reds, "Outros" is gray
    const DONUT_COLORS = [
        '#991b1b', // Top 1: Dark Red
        '#b91c1c',
        '#dc2626',
        '#ef4444',
        '#f87171',
        '#fca5a5'
    ];
    // If we have "Outros", it will be the last item, assign it gray
    const getDonutColor = (index: number, name: string) => {
        if (name === (t("movements.others") || "Outros")) return '#94a3b8'; // Gray
        return DONUT_COLORS[index % DONUT_COLORS.length];
    };

    // Process Budget vs Actual (Show all budgeted categories + unbudgeted ones with expenses)
    const budgetMap: Record<string, number> = {};
    budgets.forEach(b => budgetMap[b.Category] = b.Budget);

    // Only show categories that are enabled in settings and have a budget or have actual movements
    const activeExpenseCategories = settings?.expenseCategories || [];
    const allCategories = activeExpenseCategories;

    const budgetVsActual = allCategories.map(category => ({
        category,
        actual: categoryAgg[category] || 0,
        budget: budgetMap[category] || 0
    })).sort((a, b) => b.budget - a.budget); // Sort by largest budget first

    // Process Top Vendors (by Description)
    const vendorAgg: Record<string, { value: number, count: number }> = {};
    currentMovements.filter(m => m.Type === "Expense").forEach(m => {
        if (!vendorAgg[m.Description]) vendorAgg[m.Description] = { value: 0, count: 0 };
        vendorAgg[m.Description].value += Math.abs(m.Value);
        vendorAgg[m.Description].count += 1;
    });
    const topVendors = Object.entries(vendorAgg)
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);

    // Net Cash Flow (Monthly result)
    const monthlyNetAgg: Record<string, { monthKey: string, date: string, income: number, expense: number }> = {};
    movements.forEach(m => {
        const dateObj = parseCustomDate(m.Date);
        const monthKey = `${dateObj.getFullYear()}-${(dateObj.getMonth() + 1).toString().padStart(2, '0')}`;
        const displayDate = dateObj.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');

        if (!monthlyNetAgg[monthKey]) {
            monthlyNetAgg[monthKey] = { monthKey, date: displayDate, income: 0, expense: 0 };
        }
        if (m.Type === "Income") monthlyNetAgg[monthKey].income += m.Value;
        else monthlyNetAgg[monthKey].expense += Math.abs(m.Value);
    });

    const cashFlowData = Object.values(monthlyNetAgg)
        .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
        .map(d => ({
            date: d.date,
            value: d.income - d.expense
        }));

    if (loading) return (
        <div className="flex items-center justify-center min-h-[400px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
    );

    return (
        <div className="flex flex-col gap-8">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-foreground">{t("movements.title")}</h1>
                    <div className="flex items-center gap-2 mt-1">
                        <p className="text-sm text-slate-500 dark:text-slate-400">{t("movements.description")}</p>
                        <span className="size-1 rounded-full bg-slate-400" />
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                            {latestDate.toLocaleDateString(t("nav.selectLanguage") === "English" ? 'en-US' : 'pt-BR', { month: 'long', year: 'numeric' })}
                        </span>
                    </div>
                </div>
            </div>

            {/* KPI Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Total Income */}
                <div className="group rounded-xl bg-surface p-6 shadow-sm border border-border hover:border-green-500/50 transition-all text-center md:text-left">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{t("movements.totalIncome")}</p>
                    <h3 className="text-2xl font-bold text-foreground">{formatCurrency(curr.income)}</h3>
                    <div className={`mt-2 flex items-center justify-center md:justify-start gap-1 text-xs font-bold ${incomeVar >= 0 ? "text-green-500" : "text-red-500"}`}>
                        <span className="material-symbols-outlined text-sm">{incomeVar >= 0 ? "trending_up" : "trending_down"}</span>
                        <span>{incomeVar >= 0 ? "+" : ""}{incomeVar.toFixed(1)}% {t("movements.vsLastMonth")}</span>
                    </div>
                </div>
                {/* Total Expenses */}
                <div className="group rounded-xl bg-surface p-6 shadow-sm border border-border hover:border-red-500/50 transition-all text-center md:text-left">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{t("movements.totalExpenses")}</p>
                    <h3 className="text-2xl font-bold text-foreground">{formatCurrency(curr.expenses)}</h3>
                    <div className={`mt-2 flex items-center justify-center md:justify-start gap-1 text-xs font-bold ${expenseVar <= 0 ? "text-green-500" : "text-red-500"}`}>
                        <span className="material-symbols-outlined text-sm">{expenseVar <= 0 ? "trending_down" : "trending_up"}</span>
                        <span>{expenseVar >= 0 ? "+" : ""}{expenseVar.toFixed(1)}% {t("movements.vsLastMonth")}</span>
                    </div>
                </div>
                {/* Savings Rate */}
                <div className="group rounded-xl bg-surface p-6 shadow-sm border border-border hover:border-primary/50 transition-all text-center md:text-left">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{t("movements.savingsRate")}</p>
                    <h3 className="text-2xl font-bold text-foreground">{savingsRate.toFixed(1)}%</h3>
                    <div className={`mt-2 flex items-center justify-center md:justify-start gap-1 text-xs font-bold ${savingsVar >= 0 ? "text-green-500" : "text-red-500"}`}>
                        <span className="material-symbols-outlined text-sm">{savingsVar >= 0 ? "ads_click" : "trending_down"}</span>
                        <span>{savingsVar >= 0 ? "+" : ""}{savingsVar.toFixed(1)}% {t("movements.fromLastMonth")}</span>
                    </div>
                </div>
                {/* Remaining Budget */}
                <div className="group rounded-xl bg-surface p-6 shadow-sm border border-border hover:border-primary/50 transition-all text-center md:text-left">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{t("movements.remainingBudget")}</p>
                    <h3 className="text-2xl font-bold text-foreground">{formatCurrency(Math.max(0, curr.net))}</h3>
                    <div className="mt-2 flex items-center justify-center md:justify-start gap-1 text-xs font-bold text-slate-500">
                        <span className="material-symbols-outlined text-sm">event</span>
                        <span>{currentMonth} {latestDate.getFullYear()}</span>
                    </div>
                </div>
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Income vs Expenses */}
                <div className="rounded-xl bg-surface border border-border shadow-sm p-6 flex flex-col min-h-[400px]">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="text-lg font-bold text-foreground">{t("movements.incomeVsExpenses")}</h3>
                            <p className="text-xs text-slate-500">{t("movements.incomeVsExpensesDesc")}</p>
                        </div>
                        <div className="flex gap-4">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                                <div className="size-2 rounded-full bg-green-400" /> {t("movements.income")}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                                <div className="size-2 rounded-full bg-red-400" /> {t("movements.expense")}
                            </div>
                        </div>
                    </div>
                    <div className="flex-1">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={barChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                                <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} tickMargin={10} />
                                <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v / 1000}k`} />
                                <RechartsTooltip
                                    cursor={{ fill: 'transparent' }}
                                    content={({ active, payload }) => {
                                        if (!active || !payload?.length) return null;
                                        return (
                                            <div className="rounded-lg px-3 py-2 border shadow-lg" style={{ backgroundColor: tooltipBg, borderColor: tooltipBorder, color: tooltipTextColor }}>
                                                <p className="text-xs font-bold mb-1" style={{ color: tooltipLabelColor }}>{payload[0].payload.date}</p>
                                                {payload.map((entry: any, i: number) => (
                                                    <p key={i} className="text-xs font-medium">
                                                        <span style={{ color: entry.dataKey === "income" ? "#34d399" : "#f87171" }}>
                                                            {entry.name || entry.dataKey} : {formatCurrency(entry.value)}
                                                        </span>
                                                    </p>
                                                ))}
                                            </div>
                                        );
                                    }}
                                />
                                <Bar dataKey="income" fill="#34d399" radius={[4, 4, 0, 0]} barSize={40} />
                                <Bar dataKey="expense" fill="#f87171" radius={[4, 4, 0, 0]} barSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Spending by Category */}
                <div className="rounded-xl bg-surface border border-border shadow-sm p-6 flex flex-col min-h-[400px]">
                    <h3 className="text-lg font-bold text-foreground mb-6">{t("movements.spendingByCategory")}</h3>
                    <div className="flex-1 flex flex-col md:flex-row items-center gap-8">
                        <div className="relative size-48 shrink-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={donutData}
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                        stroke="none"
                                    >
                                        {donutData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={getDonutColor(index, entry.name)} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip
                                        content={({ active, payload }) => {
                                            if (!active || !payload?.length) return null;
                                            const { name, value } = payload[0].payload;
                                            const idx = donutData.findIndex((d) => d.name === name);
                                            const segmentColor = idx >= 0 ? getDonutColor(idx, name) : tooltipTextColor;
                                            return (
                                                <div
                                                    className="rounded-lg px-3 py-2 shadow-lg border"
                                                    style={{
                                                        zIndex: 9999,
                                                        backgroundColor: tooltipBg,
                                                        borderColor: tooltipBorder,
                                                    }}
                                                >
                                                    <span style={{ color: segmentColor, fontWeight: 700 }}>{name}</span>
                                                    <span className="text-sm font-medium" style={{ color: tooltipTextColor }}> : {formatCurrency(value)}</span>
                                                </div>
                                            );
                                        }}
                                        wrapperStyle={{ zIndex: 9999 }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <span className="text-xl font-bold text-foreground">{formatCurrency(curr.expenses / 1000)}k</span>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{t("movements.totalExpenses")}</span>
                            </div>
                        </div>
                        <div className="flex-1 space-y-4 w-full">
                            {donutData.map((entry: any, index: number) => (
                                <div key={entry.name} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="size-2 rounded-full" style={{ backgroundColor: getDonutColor(index, entry.name) }} />
                                        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{entry.name}</span>
                                    </div>
                                    <span className="text-sm font-bold text-foreground">{((entry.value / curr.expenses) * 100).toFixed(0)}%</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Charts Row 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Budget vs Actual */}
                <div className="lg:col-span-1 rounded-xl bg-surface border border-border shadow-sm p-6 flex flex-col h-[400px]">
                    <h3 className="text-lg font-bold text-foreground mb-6">{t("movements.budgetVsActual")}</h3>
                    <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800 space-y-6">
                        {budgetVsActual.map((item) => {
                            const actualPct = item.budget > 0 ? (item.actual / item.budget) * 100 : (item.actual > 0 ? 100 : 0);
                            const displayPct = Math.min(100, actualPct);
                            const isOver = item.actual > item.budget && item.budget > 0;
                            const badgeColorClass = isOver ? "bg-red-500/10 text-red-500" : "bg-blue-500/10 text-blue-500";

                            return (
                                <div key={item.category}>
                                    <div className="flex justify-between items-center text-sm mb-2.5">
                                        <div className="flex items-center gap-2">
                                            <span className="text-foreground font-medium">{item.category}</span>
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${badgeColorClass}`}>
                                                {actualPct.toFixed(0)}%
                                            </span>
                                        </div>
                                        <span className={`font-bold ${isOver ? "text-red-500" : "text-slate-400"}`}>
                                            {formatCurrency(item.actual)} <span className="text-slate-500 font-normal">/ {formatCurrency(item.budget)}</span>
                                        </span>
                                    </div>
                                    <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                            className="h-full transition-all duration-1000 rounded-full"
                                            style={{
                                                width: `${displayPct}%`,
                                                backgroundColor: isOver ? "#ef4444" : "#3b82f6"
                                            }}
                                        />
                                    </div>
                                    {isOver && (
                                        <div className="flex items-center gap-1.5 mt-2 text-[10px] font-bold text-red-500 uppercase tracking-widest">
                                            <span className="material-symbols-outlined text-[14px]">warning</span>
                                            {t("movements.overspent").replace("{amount}", formatCurrency(item.actual - item.budget))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Top Vendors */}
                <div className="lg:col-span-1 rounded-xl bg-surface border border-border shadow-sm p-6 flex flex-col h-[400px]">
                    <h3 className="text-lg font-bold text-foreground mb-6">{t("movements.topVendors")}</h3>
                    <div className="flex-1 space-y-3">
                        {topVendors.map((vendor) => (
                            <div key={vendor.name} className="group relative flex items-center gap-3 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-transparent hover:border-border">
                                <div className="size-8 rounded-lg bg-surface border border-border flex items-center justify-center text-slate-400">
                                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>shopping_cart</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-foreground truncate cursor-help">{vendor.name}</p>
                                    <p className="text-xs text-slate-500"><span className="font-bold text-slate-700 dark:text-slate-300">{vendor.count}</span> Transactions</p>
                                </div>
                                <span className="text-sm font-bold text-red-500">-{formatCurrency(vendor.value)}</span>

                                {/* Custom Fast Tooltip */}
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900 text-white text-xs rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-75 pointer-events-none z-50 whitespace-normal min-w-[200px] max-w-[300px]">
                                    {vendor.name}
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-900" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Net Cash Flow */}
                <div className="lg:col-span-1 rounded-xl bg-surface border border-border shadow-sm p-6 flex flex-col h-[400px]">
                    <h3 className="text-lg font-bold text-foreground">{t("movements.netCashFlow")}</h3>
                    <p className="text-xs text-slate-500 mb-6">{t("movements.netCashFlowDesc")}</p>
                    <div className="flex-1">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={cashFlowData}>
                                <defs>
                                    <linearGradient id="colorCash" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis
                                    dataKey="date"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 10, fill: '#64748b' }}
                                    dy={5}
                                />
                                <YAxis hide />
                                <RechartsTooltip
                                    cursor={false}
                                    content={({ active, payload }) => {
                                        if (!active || !payload?.length) return null;
                                        return (
                                            <div className="rounded-lg px-3 py-2 border shadow-lg" style={{ backgroundColor: tooltipBg, borderColor: tooltipBorder, color: tooltipTextColor }}>
                                                <p className="text-xs font-bold mb-1" style={{ color: tooltipLabelColor }}>{payload[0].payload.date}</p>
                                                <p className="text-xs font-medium">
                                                    {t("movements.cash") || "Value"}: {formatCurrency(payload[0].value as number)}
                                                </p>
                                            </div>
                                        );
                                    }}
                                />
                                <Area type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <DailyTrackingChart movements={movements} t={t} formatCurrency={formatCurrency} />

            <MovementsTable movements={movements} onUpdate={fetchData} />
        </div>
    );
}
