"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/lib/i18n";
import { MovementEntry, BudgetEntry } from "@/types/database";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, AreaChart, Area } from "recharts";
import AddMovementModal from "@/components/AddMovementModal";
import MovementsTable from "@/components/MovementsTable";

export default function MovementsPage() {
    const { t, formatCurrency } = useTranslation();
    const [movements, setMovements] = useState<MovementEntry[]>([]);
    const [budgets, setBudgets] = useState<BudgetEntry[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        try {
            const res = await fetch("/api/movements");
            const data = await res.json();
            setMovements(data.movements || []);
            setBudgets(data.budgets || []);
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
    const now = new Date();
    const currentMonth = now.toLocaleString('en-US', { month: 'short' });
    const currentYear = String(now.getFullYear()).slice(-2);
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = prevMonthDate.toLocaleString('en-US', { month: 'short' });
    const prevYear = String(prevMonthDate.getFullYear()).slice(-2);

    const matchMonth = (dateStr: string, m: string, y: string) => {
        const parts = dateStr.split('/'); // DD/MMM/YY
        return parts[1] === m && parts[2] === y;
    };

    const currentMovements = movements.filter(m => matchMonth(m.Date, currentMonth, currentYear));
    const previousMovements = movements.filter(m => matchMonth(m.Date, prevMonth, prevYear));

    const getTotals = (list: MovementEntry[]) => {
        const income = list.filter(m => m.Type === "Income").reduce((acc, m) => acc + m.Value, 0);
        const expenses = list.filter(m => m.Type === "Expense").reduce((acc, m) => acc + m.Value, 0);
        return { income, expenses, net: income - expenses };
    };

    const curr = getTotals(currentMovements);
    const prev = getTotals(previousMovements);

    const calcVar = (c: number, p: number) => p > 0 ? ((c - p) / p) * 100 : 0;

    const incomeVar = calcVar(curr.income, prev.income);
    const expenseVar = calcVar(curr.expenses, prev.expenses);
    const savingsRate = curr.income > 0 ? (curr.net / curr.income) * 100 : 0;
    const prevSavingsRate = prev.income > 0 ? (prev.net / prev.income) * 100 : 0;
    const savingsVar = savingsRate - prevSavingsRate;

    // Process Data for Income vs Expenses Bar Chart (Daily/Monthly aggregated by Date)
    const aggregatedByDate: Record<string, { date: string, income: number, expense: number }> = {};
    movements.forEach(m => {
        if (!aggregatedByDate[m.Date]) {
            aggregatedByDate[m.Date] = { date: m.Date.split('/')[0] + '/' + m.Date.split('/')[1], income: 0, expense: 0 };
        }
        if (m.Type === "Income") aggregatedByDate[m.Date].income += m.Value;
        else aggregatedByDate[m.Date].expense += m.Value;
    });
    const barChartData = Object.values(aggregatedByDate).sort((a, b) => a.date.localeCompare(b.date)).slice(-7);

    // Process Data for Spending by Category (Donut)
    const categoryAgg: Record<string, number> = {};
    currentMovements.filter(m => m.Type === "Expense").forEach(m => {
        categoryAgg[m.Category] = (categoryAgg[m.Category] || 0) + m.Value;
    });

    const donutData = Object.entries(categoryAgg).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    const DONUT_COLORS = ['#f87171', '#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d'];

    // Process Budget vs Actual
    const budgetMap: Record<string, number> = {};
    budgets.forEach(b => budgetMap[b.Category] = b.Budget);
    const budgetVsActual = Object.entries(categoryAgg).map(([category, actual]) => ({
        category,
        actual,
        budget: budgetMap[category] || (actual as number) * 1.2
    }));

    // Process Top Vendors (by Description)
    const vendorAgg: Record<string, { value: number, count: number }> = {};
    currentMovements.filter(m => m.Type === "Expense").forEach(m => {
        if (!vendorAgg[m.Description]) vendorAgg[m.Description] = { value: 0, count: 0 };
        vendorAgg[m.Description].value += m.Value;
        vendorAgg[m.Description].count += 1;
    });
    const topVendors = Object.entries(vendorAgg)
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);

    // Net Cash Flow (Cumulative)
    let cumulative = 0;
    const cashFlowData = Object.values(aggregatedByDate)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(d => {
            cumulative += (d.income - d.expense);
            return { date: d.date, value: cumulative };
        });

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
                    <p className="text-sm text-slate-500 dark:text-slate-400">Track your cash flow and optimize your spending</p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all cursor-pointer"
                >
                    <span className="material-symbols-outlined text-[20px]">add_circle</span>
                    {t("movements.addMovement")}
                </button>
            </div>

            {/* KPI Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Total Income */}
                <div className="group rounded-xl bg-surface p-6 shadow-sm border border-border hover:border-green-500/50 transition-all text-center md:text-left">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{t("movements.totalIncome")}</p>
                    <h3 className="text-2xl font-bold text-foreground">{formatCurrency(curr.income)}</h3>
                    <div className={`mt-2 flex items-center justify-center md:justify-start gap-1 text-xs font-bold ${incomeVar >= 0 ? "text-green-500" : "text-red-500"}`}>
                        <span className="material-symbols-outlined text-sm">{incomeVar >= 0 ? "trending_up" : "trending_down"}</span>
                        <span>{incomeVar >= 0 ? "+" : ""}{incomeVar.toFixed(1)}% vs last month</span>
                    </div>
                </div>
                {/* Total Expenses */}
                <div className="group rounded-xl bg-surface p-6 shadow-sm border border-border hover:border-red-500/50 transition-all text-center md:text-left">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{t("movements.totalExpenses")}</p>
                    <h3 className="text-2xl font-bold text-foreground">{formatCurrency(curr.expenses)}</h3>
                    <div className={`mt-2 flex items-center justify-center md:justify-start gap-1 text-xs font-bold ${expenseVar <= 0 ? "text-green-500" : "text-red-500"}`}>
                        <span className="material-symbols-outlined text-sm">{expenseVar <= 0 ? "trending_down" : "trending_up"}</span>
                        <span>{expenseVar >= 0 ? "+" : ""}{expenseVar.toFixed(1)}% vs last month</span>
                    </div>
                </div>
                {/* Savings Rate */}
                <div className="group rounded-xl bg-surface p-6 shadow-sm border border-border hover:border-primary/50 transition-all text-center md:text-left">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{t("movements.savingsRate")}</p>
                    <h3 className="text-2xl font-bold text-foreground">{savingsRate.toFixed(1)}%</h3>
                    <div className={`mt-2 flex items-center justify-center md:justify-start gap-1 text-xs font-bold ${savingsVar >= 0 ? "text-green-500" : "text-red-500"}`}>
                        <span className="material-symbols-outlined text-sm">{savingsVar >= 0 ? "ads_click" : "trending_down"}</span>
                        <span>{savingsVar >= 0 ? "+" : ""}{savingsVar.toFixed(1)}% from last month</span>
                    </div>
                </div>
                {/* Remaining Budget */}
                <div className="group rounded-xl bg-surface p-6 shadow-sm border border-border hover:border-primary/50 transition-all text-center md:text-left">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{t("movements.remainingBudget")}</p>
                    <h3 className="text-2xl font-bold text-foreground">{formatCurrency(Math.max(0, curr.net))}</h3>
                    <div className="mt-2 flex items-center justify-center md:justify-start gap-1 text-xs font-bold text-slate-500">
                        <span className="material-symbols-outlined text-sm">schedule</span>
                        <span>{31 - now.getDate()} days remaining</span>
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
                            <p className="text-xs text-slate-500">Daily financial activity tracking</p>
                        </div>
                        <div className="flex gap-4">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                                <div className="size-2 rounded-full bg-green-400" /> Income
                            </div>
                            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                                <div className="size-2 rounded-full bg-red-400" /> Expenses
                            </div>
                        </div>
                    </div>
                    <div className="flex-1">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={barChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                                <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} tickMargin={10} />
                                <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v / 1000}k`} />
                                <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
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
                                            <Cell key={`cell-${index}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                                        ))}
                                    </Pie>
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-xl font-bold text-foreground">{formatCurrency(curr.expenses / 1000)}k</span>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Total Spent</span>
                            </div>
                        </div>
                        <div className="flex-1 space-y-4 w-full">
                            {donutData.map((entry: any, index: number) => (
                                <div key={entry.name} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="size-2 rounded-full" style={{ backgroundColor: DONUT_COLORS[index % DONUT_COLORS.length] }} />
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
                <div className="lg:col-span-1 rounded-xl bg-surface border border-border shadow-sm p-6">
                    <h3 className="text-lg font-bold text-foreground mb-6">{t("movements.budgetVsActual")}</h3>
                    <div className="space-y-6">
                        {budgetVsActual.map((item) => {
                            const pct = Math.min(100, (item.actual / item.budget) * 100);
                            const isOver = item.actual > item.budget;
                            return (
                                <div key={item.category}>
                                    <div className="flex justify-between text-sm font-medium mb-1.5">
                                        <span className="text-foreground">{item.category}</span>
                                        <span className="text-slate-500">{formatCurrency(item.actual)} / {formatCurrency(item.budget)}</span>
                                    </div>
                                    <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full transition-all duration-1000 rounded-full ${isOver ? 'bg-red-600' : 'bg-red-400'}`}
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                    {isOver && (
                                        <p className="text-[10px] font-bold text-red-500 mt-1 uppercase">Overspent by {formatCurrency(item.actual - item.budget)}</p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Top Vendors */}
                <div className="lg:col-span-1 rounded-xl bg-surface border border-border shadow-sm p-6 flex flex-col">
                    <h3 className="text-lg font-bold text-foreground mb-6">{t("movements.topVendors")}</h3>
                    <div className="flex-1 space-y-3">
                        {topVendors.map((vendor) => (
                            <div key={vendor.name} className="flex items-center gap-4 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-transparent hover:border-border">
                                <div className="size-10 rounded-lg bg-surface border border-border flex items-center justify-center text-slate-400">
                                    <span className="material-symbols-outlined">shopping_cart</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-foreground truncate">{vendor.name}</p>
                                    <p className="text-xs text-slate-500">{vendor.count} Transactions</p>
                                </div>
                                <span className="text-sm font-bold text-red-500">-{formatCurrency(vendor.value)}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Net Cash Flow */}
                <div className="lg:col-span-1 rounded-xl bg-surface border border-border shadow-sm p-6 flex flex-col min-h-[300px]">
                    <h3 className="text-lg font-bold text-foreground">{t("movements.netCashFlow")}</h3>
                    <p className="text-xs text-slate-500 mb-6">Cumulative trend line</p>
                    <div className="flex-1">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={cashFlowData}>
                                <defs>
                                    <linearGradient id="colorCash" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="date" hide />
                                <YAxis hide />
                                <Tooltip cursor={false} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                <Area type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <MovementsTable movements={movements} onUpdate={fetchData} />

            {isModalOpen && <AddMovementModal onClose={() => setIsModalOpen(false)} />}
        </div>
    );
}
