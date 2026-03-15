"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { MovementEntry } from "@/types/database";
import { parseCustomDate } from "@/lib/utils";

interface Props {
    movements: MovementEntry[];
    t: any;
    formatCurrency: (val: number) => string;
}

export default function DailyTrackingChart({ movements, t, formatCurrency }: Props) {
    const [timeRange, setTimeRange] = useState<"week" | "month" | "quarter" | "semester" | "year" | "last7" | "last30">("month");
    const [rangeStart, setRangeStart] = useState(0);
    const [rangeEnd, setRangeEnd] = useState(100); // percentage 0-100
    const [showOnlyWithData, setShowOnlyWithData] = useState(false);

    const chartData = useMemo(() => {
        if (!movements.length) return [];

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        let startDate = new Date(today);
        let endDate = new Date(today);

        if (timeRange === "week") {
            // Monday of current week
            const day = today.getDay();
            const diff = today.getDate() - day + (day === 0 ? -6 : 1);
            startDate = new Date(today.getFullYear(), today.getMonth(), diff);
            // "Até sexta"
            endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 4);
        } else if (timeRange === "month") {
            startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        } else if (timeRange === "quarter") {
            const quarter = Math.floor(today.getMonth() / 3);
            startDate = new Date(today.getFullYear(), quarter * 3, 1);
            endDate = new Date(today.getFullYear(), (quarter + 1) * 3, 0);
        } else if (timeRange === "semester") {
            const semester = Math.floor(today.getMonth() / 6);
            startDate = new Date(today.getFullYear(), semester * 6, 1);
            endDate = new Date(today.getFullYear(), (semester + 1) * 6, 0);
        } else if (timeRange === "year") {
            startDate = new Date(today.getFullYear(), 0, 1);
            endDate = new Date(today.getFullYear(), 11, 31);
        } else if (timeRange === "last7") {
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 7);
            endDate = new Date(today);
        } else if (timeRange === "last30") {
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 30);
            endDate = new Date(today);
        }

        const filtered = movements.filter(m => {
            const d = parseCustomDate(m.Date);
            return d >= startDate && d <= endDate;
        });

        const dailyAgg: Record<string, { date: string, dateObj: Date, income: number, expense: number }> = {};

        filtered.forEach(m => {
            const dateObj = parseCustomDate(m.Date);
            const dateStr = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
            const isoKey = dateObj.toISOString().split('T')[0];

            if (!dailyAgg[isoKey]) {
                dailyAgg[isoKey] = { date: dateStr, dateObj, income: 0, expense: 0 };
            }

            if (m.Type === "Income") dailyAgg[isoKey].income += m.Value;
            if (m.Type === "Expense") dailyAgg[isoKey].expense += m.Value;
        });

        const result = [];
        let current = new Date(startDate);
        while (current <= endDate) {
            const isoKey = current.toISOString().split('T')[0];
            if (dailyAgg[isoKey]) {
                result.push(dailyAgg[isoKey]);
            } else if (!showOnlyWithData) {
                const dateStr = current.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
                result.push({ date: dateStr, dateObj: new Date(current), income: 0, expense: 0 });
            }
            current.setDate(current.getDate() + 1);
        }

        return result;
    }, [movements, timeRange, showOnlyWithData]);

    // Reset range when time range changes
    const handleTimeRangeChange = (val: string) => {
        setTimeRange(val as any);
        setRangeStart(0);
        setRangeEnd(100);
    };

    const displayData = useMemo(() => {
        if (!chartData.length) return [];
        const startIdx = Math.floor((rangeStart / 100) * (chartData.length - 1));
        const endIdx = Math.floor((rangeEnd / 100) * (chartData.length - 1));
        return chartData.slice(startIdx, endIdx + 1);
    }, [chartData, rangeStart, rangeEnd]);


    const startLabel = displayData.length > 0 ? displayData[0].date : '';
    const endLabel = displayData.length > 0 ? displayData[displayData.length - 1].date : '';

    const kpis = useMemo(() => {
        const totalIncome = displayData.reduce((acc, curr) => acc + curr.income, 0);
        const totalExpense = displayData.reduce((acc, curr) => acc + curr.expense, 0);
        // Correcting net balance: income is positive, expense is usually negative in the DB
        // If expense is already negative, adding it is correct. If it's positive, we subtract.
        // Let's use the explicit subtraction of absolute values to be safe or just sum raw if they are signed.
        return { income: totalIncome, expense: totalExpense, net: totalIncome + totalExpense };
    }, [displayData]);

    // --- Custom Range Slider ---
    const trackRef = useRef<HTMLDivElement>(null);
    const dragging = useRef<"start" | "end" | null>(null);

    const getPercent = useCallback((clientX: number) => {
        if (!trackRef.current) return 0;
        const rect = trackRef.current.getBoundingClientRect();
        const pct = ((clientX - rect.left) / rect.width) * 100;
        return Math.max(0, Math.min(100, pct));
    }, []);

    const onPointerDown = useCallback((handle: "start" | "end") => (e: React.PointerEvent) => {
        e.preventDefault();
        dragging.current = handle;
    }, []);

    useEffect(() => {
        const onMove = (e: PointerEvent) => {
            if (!dragging.current) return;
            const pct = getPercent(e.clientX);
            if (dragging.current === "start") {
                setRangeStart(prev => Math.min(pct, rangeEnd - 2));
            } else {
                setRangeEnd(prev => Math.max(pct, rangeStart + 2));
            }
        };
        const onUp = () => { dragging.current = null; };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
        return () => {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
        };
    }, [getPercent, rangeStart, rangeEnd]);

    return (
        <div className="rounded-xl bg-surface border border-border shadow-sm p-6 flex flex-col">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-xl font-bold text-foreground">{t("movements.dailyTracking")}</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{t("movements.dailyTrackingDesc")}</p>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                    <div className="hidden lg:flex items-center gap-3 text-sm font-medium mr-2">
                        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#10b981]"></div><span className="text-slate-400">{t("movements.income")}</span></div>
                        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#ef4444]"></div><span className="text-slate-400">{t("movements.expense")}</span></div>
                    </div>

                    <div className="flex items-center gap-4 bg-slate-100 dark:bg-slate-800/50 rounded-lg p-1 px-2 border border-border/50">
                        <div className="flex items-center gap-2 cursor-pointer group" onClick={() => setShowOnlyWithData(!showOnlyWithData)}>
                            <div className={`w-4 h-4 rounded border transition-colors flex items-center justify-center ${showOnlyWithData ? 'bg-primary border-primary' : 'bg-surface border-slate-300 dark:border-slate-600 group-hover:border-primary'}`}>
                                {showOnlyWithData && <span className="material-symbols-outlined text-[12px] text-white font-bold">check</span>}
                            </div>
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 select-none whitespace-nowrap">
                                {t("movements.daysWithData")}
                            </span>
                        </div>

                        <div className="h-4 w-px bg-border mx-1"></div>

                        <select
                            value={timeRange}
                            onChange={(e) => handleTimeRangeChange(e.target.value)}
                            className="bg-transparent border-none text-xs rounded px-1 py-1.5 font-bold text-foreground outline-none cursor-pointer"
                        >
                            <option value="last7">{t("filters.last7")}</option>
                            <option value="last30">{t("filters.last30")}</option>
                            <option value="week">{t("filters.thisWeek")}</option>
                            <option value="month">{t("filters.thisMonth")}</option>
                            <option value="quarter">{t("filters.thisQuarter")}</option>
                            <option value="semester">{t("filters.thisSemester")}</option>
                            <option value="year">{t("filters.thisYear")}</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Unified Logarithmic Chart */}
            <div className="flex-1 mt-4 relative min-h-[320px] w-full" style={{ height: 320 }}>
                {displayData.length > 0 ? (
                    <div className="h-full w-full">
                        <ResponsiveContainer width="99%" height={320}>
                            <AreaChart 
                                data={displayData.map(d => ({
                                    ...d,
                                    incomeScaled: Math.sqrt(Math.abs(d.income)),
                                    expenseScaled: Math.sqrt(Math.abs(d.expense))
                                }))} 
                                margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
                            >
                                <defs>
                                    <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                
                                <XAxis 
                                    dataKey="date" 
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
                                    dy={10}
                                    minTickGap={30}
                                />
                                <YAxis 
                                    hide 
                                />
                                
                                <Tooltip
                                    cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }}
                                    content={({ active, payload, label }) => {
                                        if (!active || !payload?.length) return null;
                                        const dataPoint = displayData.find(d => d.date === label);
                                        if (!dataPoint) return null;
                                        return (
                                            <div className="rounded-xl px-4 py-3 border shadow-2xl bg-surface/90 backdrop-blur-md border-border text-foreground z-[100] pointer-events-none min-w-[180px]">
                                                <p className="text-[10px] font-bold mb-2 text-slate-500 uppercase tracking-widest">{label}</p>
                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-2 h-2 rounded-full bg-[#10b981]" />
                                                            <span className="text-xs font-medium text-slate-500">{t("movements.income")}</span>
                                                        </div>
                                                        <span className="text-xs font-bold text-[#10b981]">{formatCurrency(dataPoint.income)}</span>
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-2 h-2 rounded-full bg-[#ef4444]" />
                                                            <span className="text-xs font-medium text-slate-500">{t("movements.expense")}</span>
                                                        </div>
                                                        <span className="text-xs font-bold text-[#ef4444]">{formatCurrency(dataPoint.expense)}</span>
                                                    </div>
                                                    <div className="pt-2 mt-2 border-t border-border flex items-center justify-between">
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase">{t("movements.netBalance")}</span>
                                                        <span className={`text-xs font-bold ${dataPoint.income - dataPoint.expense >= 0 ? 'text-blue-500' : 'text-amber-500'}`}>
                                                            {formatCurrency(dataPoint.income - dataPoint.expense)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }}
                                />

                                <Area
                                    type="monotone"
                                    dataKey="incomeScaled"
                                    stroke="#10b981"
                                    strokeWidth={2.5}
                                    fillOpacity={1}
                                    fill="url(#colorIncome)"
                                    isAnimationActive={false}
                                />
                                
                                <Area
                                    type="monotone"
                                    dataKey="expenseScaled"
                                    stroke="#ef4444"
                                    strokeWidth={2.5}
                                    fillOpacity={1}
                                    fill="url(#colorExpense)"
                                    isAnimationActive={false}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <div className="h-full w-full flex items-center justify-center border-2 border-dashed border-border rounded-xl bg-slate-50/50 dark:bg-slate-900/50">
                        <p className="text-slate-400 text-sm font-medium">{t("movements.noData")}</p>
                    </div>
                )}
            </div>

            {/* Custom Range Slider — matching reference image */}
            <div
                className="relative mt-4 mx-4 select-none"
                style={{ height: 65 }}
            >
                {/* Track line */}
                <div ref={trackRef} className="absolute top-[11px] left-0 right-0 h-[2px] bg-slate-200 dark:bg-slate-700 rounded-full" />

                {/* Active range highlight */}
                <div
                    className="absolute top-[11px] h-[2px] bg-blue-500 rounded-full"
                    style={{ left: `${rangeStart}%`, right: `${100 - rangeEnd}%` }}
                />

                {/* Start handle */}
                <div
                    className="absolute flex flex-col items-center cursor-grab active:cursor-grabbing"
                    style={{ left: `${rangeStart}%`, top: 0, transform: 'translateX(-50%)' }}
                    onPointerDown={onPointerDown("start")}
                >
                    <div className="w-[22px] h-[22px] rounded-full border-[3px] border-blue-500 bg-white dark:bg-slate-900 shadow-[0_0_8px_rgba(59,130,246,0.3)] transition-colors" />
                    <div className="mt-2 text-[11px] font-semibold text-slate-500 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded px-2 py-0.5 whitespace-nowrap shadow-sm">
                        {startLabel}
                    </div>
                </div>

                {/* End handle */}
                <div
                    className="absolute flex flex-col items-center cursor-grab active:cursor-grabbing"
                    style={{ left: `${rangeEnd}%`, top: 0, transform: 'translateX(-50%)' }}
                    onPointerDown={onPointerDown("end")}
                >
                    <div className="w-[22px] h-[22px] rounded-full border-[3px] border-blue-500 bg-white dark:bg-slate-900 shadow-[0_0_8px_rgba(59,130,246,0.3)] transition-colors" />
                    <div className="mt-2 text-[11px] font-semibold text-slate-500 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded px-2 py-0.5 whitespace-nowrap shadow-sm">
                        {endLabel}
                    </div>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-3 divide-x divide-border border-t border-border mt-2 pt-3">
                <div className="text-center px-4">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{t("movements.totalIncome")}</p>
                    <p className="text-xl font-bold text-[#10b981]">{formatCurrency(kpis.income)}</p>
                </div>
                <div className="text-center px-4">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{t("movements.totalExpenses")}</p>
                    <p className="text-xl font-bold text-[#ef4444]">{formatCurrency(kpis.expense)}</p>
                </div>
                <div className="text-center px-4">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{t("movements.netBalance")}</p>
                    <p className="text-xl font-bold text-[#3b82f6]">{formatCurrency(kpis.net)}</p>
                </div>
            </div>
        </div>
    );
}
