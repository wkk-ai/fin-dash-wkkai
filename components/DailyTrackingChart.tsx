"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { MovementEntry } from "@/types/database";
import { parseCustomDate } from "@/lib/utils";

interface Props {
    movements: MovementEntry[];
    t: any;
    formatCurrency: (val: number) => string;
}

export default function DailyTrackingChart({ movements, t, formatCurrency }: Props) {
    const [timeRange, setTimeRange] = useState<"week" | "month" | "quarter" | "semester" | "year">("month");
    const [rangeStart, setRangeStart] = useState(0);
    const [rangeEnd, setRangeEnd] = useState(100); // percentage 0-100

    const chartData = useMemo(() => {
        if (!movements.length) return [];

        const sortedMovements = [...movements].sort((a, b) => parseCustomDate(b.Date).getTime() - parseCustomDate(a.Date).getTime());
        const referenceDate = sortedMovements.length > 0 ? parseCustomDate(sortedMovements[0].Date) : new Date();

        let startDate = new Date(referenceDate);
        if (timeRange === "week") startDate.setDate(startDate.getDate() - 7);
        if (timeRange === "month") startDate.setMonth(startDate.getMonth() - 1);
        if (timeRange === "quarter") startDate.setMonth(startDate.getMonth() - 3);
        if (timeRange === "semester") startDate.setMonth(startDate.getMonth() - 6);
        if (timeRange === "year") startDate.setFullYear(startDate.getFullYear() - 1);

        const filtered = movements.filter(m => parseCustomDate(m.Date) >= startDate);

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
        while (current <= referenceDate) {
            const isoKey = current.toISOString().split('T')[0];
            if (dailyAgg[isoKey]) {
                result.push(dailyAgg[isoKey]);
            } else {
                const dateStr = current.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
                result.push({ date: dateStr, dateObj: new Date(current), income: 0, expense: 0 });
            }
            current.setDate(current.getDate() + 1);
        }

        return result;
    }, [movements, timeRange]);

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
        return { income: totalIncome, expense: totalExpense, net: totalIncome - totalExpense };
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
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }, []);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        if (!dragging.current) return;
        const pct = getPercent(e.clientX);
        if (dragging.current === "start") {
            setRangeStart(Math.min(pct, rangeEnd - 2));
        } else {
            setRangeEnd(Math.max(pct, rangeStart + 2));
        }
    }, [getPercent, rangeStart, rangeEnd]);

    const onPointerUp = useCallback(() => {
        dragging.current = null;
    }, []);

    return (
        <div className="rounded-xl bg-surface border border-border shadow-sm p-6 flex flex-col">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-xl font-bold text-foreground">{t("movements.dailyTracking")}</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{t("movements.dailyTrackingDesc")}</p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3 text-sm font-medium">
                        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#10b981]"></div><span className="text-slate-400">{t("movements.income")}</span></div>
                        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-[#ef4444]"></div><span className="text-slate-400">{t("movements.expense")}</span></div>
                    </div>

                    <select
                        value={timeRange}
                        onChange={(e) => handleTimeRangeChange(e.target.value)}
                        className="bg-slate-100 dark:bg-slate-800 border-none text-sm rounded-lg px-3 py-1.5 font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer"
                    >
                        <option value="week">{t("filters.thisWeek")}</option>
                        <option value="month">{t("filters.thisMonth")}</option>
                        <option value="quarter">{t("filters.thisQuarter")}</option>
                        <option value="semester">{t("filters.thisSemester")}</option>
                        <option value="year">{t("filters.thisYear")}</option>
                    </select>
                </div>
            </div>

            {/* Chart */}
            <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={displayData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
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
                            tick={{ fontSize: 11, fill: '#64748b' }}
                            dy={10}
                            minTickGap={40}
                        />
                        <YAxis hide />
                        <Tooltip
                            content={({ active, payload, label }) => {
                                if (!active || !payload?.length) return null;
                                return (
                                    <div className="rounded-lg px-3 py-2 border shadow-lg bg-surface border-border text-foreground">
                                        <p className="text-xs font-bold mb-1 text-slate-500">{label}</p>
                                        <p className="text-xs font-medium text-[#10b981]">
                                            {t("movements.income")}: {formatCurrency(payload[0]?.value as number)}
                                        </p>
                                        <p className="text-xs font-medium text-[#ef4444]">
                                            {t("movements.expense")}: {formatCurrency(payload[1]?.value as number)}
                                        </p>
                                    </div>
                                );
                            }}
                        />
                        <Area type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorIncome)" />
                        <Area type="monotone" dataKey="expense" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorExpense)" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* Custom Range Slider — matching reference image */}
            <div
                className="relative mt-4 mx-4 select-none"
                style={{ height: 65 }}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
            >
                {/* Track line */}
                <div ref={trackRef} className="absolute top-[11px] left-0 right-0 h-[2px] bg-slate-600 rounded-full" />

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
                    <div className="w-[22px] h-[22px] rounded-full border-[3px] border-blue-500 bg-slate-900 shadow-[0_0_8px_rgba(59,130,246,0.4)]" />
                    <div className="mt-2 text-[11px] font-semibold text-slate-300 bg-slate-800 border border-slate-600 rounded px-2 py-0.5 whitespace-nowrap">
                        {startLabel}
                    </div>
                </div>

                {/* End handle */}
                <div
                    className="absolute flex flex-col items-center cursor-grab active:cursor-grabbing"
                    style={{ left: `${rangeEnd}%`, top: 0, transform: 'translateX(-50%)' }}
                    onPointerDown={onPointerDown("end")}
                >
                    <div className="w-[22px] h-[22px] rounded-full border-[3px] border-blue-500 bg-slate-900 shadow-[0_0_8px_rgba(59,130,246,0.4)]" />
                    <div className="mt-2 text-[11px] font-semibold text-slate-300 bg-slate-800 border border-slate-600 rounded px-2 py-0.5 whitespace-nowrap">
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
