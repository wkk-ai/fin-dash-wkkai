"use client";

import React, { useEffect, useState, useMemo } from "react";
import { AssetEntry } from "@/types/database";
import { useTranslation } from "@/lib/i18n";
import { parseCustomDate, pickMonthlySnapshotDates } from "@/lib/utils";
import { useTheme } from "next-themes";
import { AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, ReferenceArea } from "recharts";
import { useChartBrush } from "@/lib/useChartBrush";
import { fetchNetWorth } from "@/lib/supabase-data";

type ProductGroup = { product: string; assets: AssetEntry[]; total: number };
type InstitutionHierarchy = { institution: string; products: ProductGroup[]; assets: AssetEntry[]; total: number };

const resolveProductType = (entry: AssetEntry) => entry.ProductType || entry.Asset;
const resolveInstitution = (entry: AssetEntry) => entry.Institution || entry.Asset;

function buildInstitutionHierarchy(assets: AssetEntry[]): InstitutionHierarchy[] {
    const byInst: Record<string, Record<string, AssetEntry[]>> = {};
    assets.forEach((asset) => {
        const inst = resolveInstitution(asset);
        const product = resolveProductType(asset);
        if (!byInst[inst]) byInst[inst] = {};
        if (!byInst[inst][product]) byInst[inst][product] = [];
        byInst[inst][product].push(asset);
    });
    return Object.entries(byInst)
        .map(([institution, productMap]) => {
            const products = Object.entries(productMap)
                .map(([product, prodAssets]) => ({
                    product,
                    assets: prodAssets.sort((a, b) => b.Value - a.Value),
                    total: prodAssets.reduce((s, a) => s + a.Value, 0),
                }))
                .sort((a, b) => b.total - a.total);
            const allAssets = products.flatMap((p) => p.assets);
            return { institution, products, assets: allAssets, total: allAssets.reduce((s, a) => s + a.Value, 0) };
        })
        .sort((a, b) => b.total - a.total);
}

const isInstitutionExpandable = (products: ProductGroup[], assetCount: number) =>
    products.length > 1 || assetCount > 1;
const isProductExpandable = (assets: AssetEntry[]) => assets.length > 1;

export default function Portfolio() {
    const { t, formatCurrency } = useTranslation();
    const { resolvedTheme } = useTheme();
    const [data, setData] = useState<AssetEntry[]>([]);
    const [filterClassification, setFilterClassification] = useState<string>("");
    const [filterInstitution, setFilterInstitution] = useState<string>("");
    const [filterProductType, setFilterProductType] = useState<string>("");
    const [filterAsset, setFilterAsset] = useState<string>("");
    const [selectedDateStr, setSelectedDateStr] = useState<string>("");

    const setClassification = (v: string) => {
        setFilterClassification(v);
        setFilterInstitution("");
        setFilterProductType("");
        setFilterAsset("");
    };

    const setInstitution = (v: string) => {
        setFilterInstitution(v);
        setFilterProductType("");
        setFilterAsset("");
    };

    const setProductTypeFilter = (v: string) => {
        setFilterProductType(v);
        setFilterAsset("");
    };
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchNetWorth()
            .then((data) => {
                setData(data);
                setLoading(false);
            })
            .catch((err) => {
                console.error("Failed to load data", err);
                setLoading(false);
            });
    }, []);

    // Chart: one snapshot per calendar month
    const uniqueDates = useMemo(() => {
        return pickMonthlySnapshotDates(Array.from(new Set(data.map((d) => d.Date))));
    }, [data]);
    const dateObjects = useMemo(() => {
        const obj: Record<string, Date> = {};
        uniqueDates.forEach((d) => (obj[d] = parseCustomDate(d)));
        return obj;
    }, [uniqueDates]);
    const chartData = useMemo(() => {
        return uniqueDates.map((dateStr) => {
            const filtered = data.filter((d) => {
                if (d.Date !== dateStr) return false;
                if (filterClassification && d.Classification !== filterClassification) return false;
                if (filterInstitution && resolveInstitution(d) !== filterInstitution) return false;
                if (filterProductType && resolveProductType(d) !== filterProductType) return false;
                if (filterAsset && d.Asset !== filterAsset) return false;
                return true;
            });
            const value = filtered.reduce((sum, d) => sum + d.Value, 0);
            return {
                name: dateObjects[dateStr]?.toLocaleString("default", { month: "short", year: "2-digit" }) ?? dateStr,
                value,
            };
        });
    }, [data, uniqueDates, dateObjects, filterClassification, filterInstitution, filterProductType, filterAsset]);
    const classifications = useMemo(() => Array.from(new Set(data.map((d) => d.Classification))).sort(), [data]);
    const institutionsList = useMemo(() => {
        const filtered = filterClassification
            ? data.filter((d) => d.Classification === filterClassification)
            : data;
        return Array.from(new Set(filtered.map((d) => resolveInstitution(d)))).sort();
    }, [data, filterClassification]);

    const productTypesList = useMemo(() => {
        let filtered = data;
        if (filterClassification) {
            filtered = filtered.filter((d) => d.Classification === filterClassification);
        }
        if (filterInstitution) {
            filtered = filtered.filter((d) => resolveInstitution(d) === filterInstitution);
        }
        return Array.from(new Set(filtered.map((d) => resolveProductType(d)))).sort();
    }, [data, filterClassification, filterInstitution]);

    const assetsList = useMemo(() => {
        let filtered = data;
        if (filterClassification) {
            filtered = filtered.filter((d) => d.Classification === filterClassification);
        }
        if (filterInstitution) {
            filtered = filtered.filter((d) => resolveInstitution(d) === filterInstitution);
        }
        if (filterProductType) {
            filtered = filtered.filter((d) => resolveProductType(d) === filterProductType);
        }
        return Array.from(new Set(filtered.map((d) => d.Asset))).sort();
    }, [data, filterClassification, filterInstitution, filterProductType]);

    const isDark = resolvedTheme === "dark";
    const portfolioBrush = useChartBrush(chartData, "value");
    const chartGridColor = isDark ? "var(--border)" : "#e2e8f0";
    const chartTickColor = isDark ? "#64748b" : "#94a3b8";
    const tooltipBg = isDark ? "var(--surface)" : "#ffffff";
    const tooltipBorder = isDark ? "var(--border)" : "#e2e8f0";
    const tooltipLabelColor = isDark ? "#94a3b8" : "#64748b";
    const tooltipTextColor = isDark ? "var(--foreground)" : "#0f172a";

    const [expandedInstitutions, setExpandedInstitutions] = useState<Set<string>>(new Set());
    const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
    const toggleInstitution = (key: string) => {
        setExpandedInstitutions(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };
    const toggleProduct = (key: string) => {
        setExpandedProducts(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    // Determine current date and previous date for MoM variation
    let currentDateStr = "";
    let prevDateStr: string | null = null;
    let allDates: string[] = [];
    if (data.length > 0) {
        allDates = pickMonthlySnapshotDates(Array.from(new Set(data.map(d => d.Date))));
        currentDateStr = selectedDateStr && allDates.includes(selectedDateStr)
            ? selectedDateStr
            : allDates[allDates.length - 1];
        const currentIdx = allDates.indexOf(currentDateStr);
        prevDateStr = currentIdx > 0 ? allDates[currentIdx - 1] : null;
    }

    const currentAssets = data.filter(d => d.Date === currentDateStr);
    const previousAssets = prevDateStr ? data.filter(d => d.Date === prevDateStr) : [];

    const getPrevValue = (asset: AssetEntry) => {
        if (!prevDateStr) return null;
        const productType = resolveProductType(asset);
        const prev = data.find(
            d => d.Date === prevDateStr
                && d.Institution === asset.Institution
                && d.Asset === asset.Asset
                && d.Classification === asset.Classification
                && resolveProductType(d) === productType
        );
        return prev ? prev.Value : null;
    };

    const calcGroupVariation = (groupAssets: AssetEntry[]) => {
        const total = groupAssets.reduce((sum, a) => sum + a.Value, 0);
        const prevTotal = groupAssets.reduce((sum, a) => {
            const pv = getPrevValue(a);
            return sum + (pv ?? 0);
        }, 0);
        const hasPrev = groupAssets.some((a) => getPrevValue(a) !== null);
        return {
            total,
            variation: hasPrev ? total - prevTotal : null,
            variationPct: hasPrev && prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null,
        };
    };

    const formatAbbreviated = (num: number) => {
        const absNum = Math.abs(num);
        if (absNum >= 1_000_000) {
            return (num / 1_000_000).toFixed(1).replace(".", ",") + "m";
        }
        if (absNum >= 1_000) {
            return (num / 1_000).toFixed(1).replace(".", ",") + "k";
        }
        return num.toFixed(1).replace(".", ",");
    };

    const totalWealth = currentAssets.reduce((sum, item) => sum + item.Value, 0);

    // Group by classification
    const grouped: Record<string, AssetEntry[]> = {};
    currentAssets.forEach((asset) => {
        if (!grouped[asset.Classification]) {
            grouped[asset.Classification] = [];
        }
        grouped[asset.Classification].push(asset);
    });

    const prevClassTotals: Record<string, number> = {};
    previousAssets.forEach((asset) => {
        prevClassTotals[asset.Classification] = (prevClassTotals[asset.Classification] || 0) + asset.Value;
    });

    // Sort by class total descending (highest first)
    const sortedGrouped = Object.entries(grouped)
        .map(([classification, assets]) => ({
            classification,
            assets,
            classTotal: assets.reduce((sum, item) => sum + item.Value, 0),
        }))
        .sort((a, b) => b.classTotal - a.classTotal);

    // Group assets by institution globally
    const prevTotalWealth = previousAssets.reduce((sum, item) => sum + item.Value, 0);
    const wealthVariationAbs = prevTotalWealth > 0 ? totalWealth - prevTotalWealth : null;
    const wealthVariationPct = prevTotalWealth > 0 ? ((totalWealth - prevTotalWealth) / prevTotalWealth) * 100 : null;

    const institutionGroupedTotals: Record<string, AssetEntry[]> = {};
    currentAssets.forEach((asset) => {
        const inst = resolveInstitution(asset);
        if (!institutionGroupedTotals[inst]) {
            institutionGroupedTotals[inst] = [];
        }
        institutionGroupedTotals[inst].push(asset);
    });

    const prevInstTotals: Record<string, number> = {};
    previousAssets.forEach((asset) => {
        const inst = resolveInstitution(asset);
        prevInstTotals[inst] = (prevInstTotals[inst] || 0) + asset.Value;
    });

    const sortedInstGrouped = buildInstitutionHierarchy(currentAssets);

    return (
        <div className="mx-auto max-w-7xl flex flex-col gap-8">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 animate-in slide-in-from-bottom-2 fade-in duration-500">
                <div>
                    <h1 className="text-3xl font-bold text-foreground">{t("portfolio.title")}</h1>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">
                        {t("portfolio.subtitle", { date: currentDateStr })}
                    </p>
                </div>
                <div className="flex flex-col md:flex-row items-center gap-4">
                    {allDates.length > 0 && (
                        <div className="relative flex items-center">
                            <select
                                value={currentDateStr}
                                onChange={(e) => setSelectedDateStr(e.target.value)}
                                className="appearance-none rounded-xl border border-border bg-surface pl-4 pr-10 py-2 text-sm font-semibold text-foreground shadow-sm focus:border-primary focus:outline-none h-[54px] cursor-pointer"
                            >
                                {allDates.map((d) => (
                                    <option key={d} value={d}>{d}</option>
                                ))}
                            </select>
                            <span className="material-symbols-outlined absolute right-3 pointer-events-none text-slate-400 text-[20px]">
                                calendar_month
                            </span>
                        </div>
                    )}
                    <div className="flex bg-surface border border-border px-4 py-2 rounded-xl shadow-sm items-center gap-3">
                        <div className="flex items-center justify-center p-2 bg-primary/10 rounded-lg text-primary size-10">
                            <span className="material-symbols-outlined text-[20px]">account_balance_wallet</span>
                        </div>
                        <div>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{t("portfolio.totalCurrent")}</p>
                            <p className="text-lg font-bold text-foreground leading-none">
                                {formatCurrency(totalWealth)}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-4 fade-in duration-700">
                {Object.keys(grouped).length === 0 ? (
                    <div className="text-center py-20 text-slate-500 border border-dashed border-border-light dark:border-border-dark rounded-xl">
                        {t("portfolio.noAssets")}
                    </div>
                ) : (
                    sortedGrouped.map(({ classification, assets, classTotal }) => {
                        const classPercentage = totalWealth > 0 ? (classTotal / totalWealth) * 100 : 0;
                        const prevClassTotal = prevClassTotals[classification] || 0;
                        const classVariationPct = prevClassTotal > 0 ? ((classTotal - prevClassTotal) / prevClassTotal) * 100 : null;
                        const classVariationAbs = prevClassTotal > 0 ? classTotal - prevClassTotal : (prevDateStr ? assets.reduce((sum, asset) => {
                            const prev = getPrevValue(asset);
                            return sum + (prev !== null ? asset.Value - prev : 0);
                        }, 0) : null);

                        const sortedInstitutions = buildInstitutionHierarchy(assets);

                        const renderAssetVariation = (asset: AssetEntry) => {
                            const prevValue = getPrevValue(asset);
                            const variation = prevValue !== null ? asset.Value - prevValue : null;
                            const variationPct = prevValue !== null && prevValue !== 0 ? (variation! / prevValue) * 100 : null;
                            return { prevValue, variation, variationPct };
                        };

                        return (
                            <div key={classification} className="rounded-xl bg-surface border border-border shadow-sm overflow-hidden">
                                <div className="px-6 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-background/50">
                                    <div className="flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary text-[20px]">category</span>
                                        <h3 className="text-lg font-bold text-foreground">{classification}</h3>
                                    </div>
                                    <div className="flex items-center gap-4 text-sm">
                                        <span className="font-bold text-foreground">{formatCurrency(classTotal)}</span>
                                        <span className="text-slate-400 dark:text-slate-500">|</span>
                                        {classVariationAbs !== null && (
                                            <>
                                                <span className={`font-semibold ${classVariationAbs >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                                                    {classVariationAbs >= 0 ? "+" : ""}{formatAbbreviated(classVariationAbs)}
                                                </span>
                                                <span className="text-slate-400 dark:text-slate-500">|</span>
                                            </>
                                        )}
                                        {classVariationPct === null ? (
                                            <span className="font-semibold text-slate-400 dark:text-slate-500">—</span>
                                        ) : (
                                            <span className="font-semibold flex items-center gap-1">
                                                <span className={`material-symbols-outlined text-[16px] ${classVariationPct >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                                                    {classVariationPct >= 0 ? "trending_up" : "trending_down"}
                                                </span>
                                                <span className={classVariationPct >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}>
                                                    {classVariationPct >= 0 ? "+" : ""}{classVariationPct.toFixed(1)}%
                                                </span>
                                                <span className="text-slate-600 dark:text-slate-300 text-xs font-semibold">{t("dashboard.vsLastMonth")}</span>
                                            </span>
                                        )}
                                        <span className="text-slate-400 dark:text-slate-500">|</span>
                                        <span className="px-2 py-0.5 rounded-full bg-border-light dark:bg-border-dark text-slate-600 dark:text-slate-300 text-xs font-semibold">
                                            {t("portfolio.ofPortfolio", { pct: classPercentage.toFixed(1) })}
                                        </span>
                                    </div>
                                </div>
                                <div className="sm:hidden p-4 space-y-3">
                                    {sortedInstitutions.map(({ institution, products, assets: instAssets, total: instTotal }) => {
                                        const instKey = `${classification}-${institution}`;
                                        const isInstExpanded = expandedInstitutions.has(instKey);
                                        const instExpandable = isInstitutionExpandable(products, instAssets.length);
                                        const instWeightInClass = classTotal > 0 ? (instTotal / classTotal) * 100 : 0;
                                        const instWeightInTotal = totalWealth > 0 ? (instTotal / totalWealth) * 100 : 0;
                                        const { variation: instVariation, variationPct: instVariationPct } = calcGroupVariation(instAssets);
                                        const singleAsset = instAssets.length === 1 ? instAssets[0] : null;

                                        return (
                                            <div
                                                key={instKey}
                                                className={`rounded-xl border border-border bg-slate-50/80 dark:bg-slate-900/40 p-4 space-y-3 ${instExpandable ? "cursor-pointer active:bg-slate-100 dark:active:bg-slate-800/60" : ""}`}
                                                onClick={() => instExpandable && toggleInstitution(instKey)}
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        {instExpandable && (
                                                            <span
                                                                className="material-symbols-outlined text-[16px] text-slate-400 transition-transform shrink-0"
                                                                style={{ transform: isInstExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
                                                            >
                                                                chevron_right
                                                            </span>
                                                        )}
                                                        <div className="size-8 rounded-full bg-primary/15 dark:bg-primary/20 flex items-center justify-center text-primary font-bold border border-primary/30 shadow-sm shrink-0 text-sm">
                                                            {institution.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-semibold text-foreground truncate">{institution}</p>
                                                            {!instExpandable && singleAsset ? (
                                                                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{singleAsset.Asset}</p>
                                                            ) : !isInstExpanded ? (
                                                                <p className="text-xs text-slate-500 dark:text-slate-400">{t("portfolio.nAssets", { count: instAssets.length })}</p>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                    <p className="text-lg font-black text-foreground tabular-nums shrink-0">{formatCurrency(instTotal)}</p>
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{t("portfolio.monthAbsVar")}</p>
                                                        {instVariation !== null ? (
                                                            <p className={`text-sm font-semibold tabular-nums ${instVariation >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                                                                {instVariation >= 0 ? "+" : ""}{formatAbbreviated(instVariation)}
                                                            </p>
                                                        ) : (
                                                            <p className="text-sm text-slate-400 dark:text-slate-500">—</p>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{t("portfolio.monthVar")}</p>
                                                        {instVariationPct !== null ? (
                                                            <p className={`text-sm font-semibold tabular-nums ${instVariationPct >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                                                                {instVariationPct >= 0 ? "+" : ""}{instVariationPct.toFixed(1)}%
                                                            </p>
                                                        ) : (
                                                            <p className="text-sm text-slate-400 dark:text-slate-500">—</p>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{t("portfolio.weightInCategory")}</p>
                                                        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 tabular-nums">{instWeightInClass.toFixed(1)}%</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{t("portfolio.weightTotal")}</p>
                                                        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 tabular-nums">{instWeightInTotal.toFixed(1)}%</p>
                                                    </div>
                                                </div>
                                                {isInstExpanded && instExpandable && (
                                                    <div className="pt-2 border-t border-border/60 space-y-2" onClick={(e) => e.stopPropagation()}>
                                                        {products.map(({ product, assets: prodAssets, total: prodTotal }) => {
                                                            const productKey = `${instKey}-${product}`;
                                                            const isProdExpanded = expandedProducts.has(productKey);
                                                            const prodExpandable = isProductExpandable(prodAssets);
                                                            const { variation: prodVariation, variationPct: prodVariationPct } = calcGroupVariation(prodAssets);

                                                            return (
                                                                <div key={productKey} className="space-y-1.5">
                                                                    <div
                                                                        className={`flex items-center justify-between gap-2 py-1.5 ${prodExpandable ? "cursor-pointer" : ""}`}
                                                                        onClick={() => prodExpandable && toggleProduct(productKey)}
                                                                    >
                                                                        <div className="flex items-center gap-2 min-w-0">
                                                                            {prodExpandable && (
                                                                                <span
                                                                                    className="material-symbols-outlined text-[14px] text-slate-400 transition-transform shrink-0"
                                                                                    style={{ transform: isProdExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
                                                                                >
                                                                                    chevron_right
                                                                                </span>
                                                                            )}
                                                                            <span className="text-xs font-semibold text-foreground/90 truncate">{product}</span>
                                                                            {!prodExpandable && (
                                                                                <span className="text-[10px] text-slate-400 truncate">{prodAssets[0]?.Asset}</span>
                                                                            )}
                                                                        </div>
                                                                        <div className="text-right shrink-0">
                                                                            <p className="text-xs font-semibold text-foreground tabular-nums">{formatCurrency(prodTotal)}</p>
                                                                            {prodVariation !== null && (
                                                                                <p className={`text-[10px] tabular-nums ${prodVariation >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                                                                                    {prodVariation >= 0 ? "+" : ""}{formatAbbreviated(prodVariation)}
                                                                                    {prodVariationPct !== null && ` (${prodVariationPct >= 0 ? "+" : ""}${prodVariationPct.toFixed(1)}%)`}
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    {isProdExpanded && prodExpandable && prodAssets.map((asset, idx) => {
                                                                        const { variation, variationPct } = renderAssetVariation(asset);
                                                                        return (
                                                                            <div key={`${productKey}-m-${asset.Asset}-${idx}`} className="flex items-center justify-between gap-2 py-1 pl-5">
                                                                                <div className="flex items-center gap-2 min-w-0">
                                                                                    <div className="size-5 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 text-[8px] font-bold shrink-0">
                                                                                        {asset.Asset.charAt(0).toUpperCase()}
                                                                                    </div>
                                                                                    <span className="text-xs font-medium text-foreground/80 truncate">{asset.Asset}</span>
                                                                                </div>
                                                                                <div className="text-right shrink-0">
                                                                                    <p className="text-xs font-semibold text-foreground tabular-nums">{formatCurrency(asset.Value)}</p>
                                                                                    <p className="text-[10px] tabular-nums">
                                                                                        {variation !== null ? (
                                                                                            <span className={variation >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}>
                                                                                                {variation >= 0 ? "+" : ""}{formatAbbreviated(variation)}
                                                                                                {variationPct !== null && ` (${variationPct >= 0 ? "+" : ""}${variationPct.toFixed(1)}%)`}
                                                                                            </span>
                                                                                        ) : (
                                                                                            <span className="text-slate-400 dark:text-slate-500">—</span>
                                                                                        )}
                                                                                    </p>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="hidden sm:block overflow-x-auto">
                                    <table className="w-full min-w-[700px] text-left border-collapse table-fixed">
                                        <thead>
                                            <tr className="bg-surface text-[10px] sm:text-xs uppercase text-slate-500 font-bold tracking-wider">
                                                <th className="px-4 py-3 w-[20%] sm:w-[22%]">{t("portfolio.institution")}</th>
                                                <th className="px-4 py-3 w-[18%] sm:w-[18%]">{t("portfolio.asset")}</th>
                                                <th className="px-4 py-3 text-right w-[18%] sm:w-[15%]">{t("portfolio.currentValue")}</th>
                                                <th className="px-4 py-3 text-right w-[14%] sm:w-[12%]">{t("portfolio.monthAbsVar")}</th>
                                                <th className="px-4 py-3 text-right w-[10%] sm:w-[10%]">{t("portfolio.monthVar")}</th>
                                                <th className="px-4 py-3 text-right w-[10%] sm:w-[12%]">{t("portfolio.weightInCategory")}</th>
                                                <th className="px-4 py-3 text-right w-[10%] sm:w-[11%]">{t("portfolio.weightTotal")}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border text-xs sm:text-sm">
                                            {sortedInstitutions.map(({ institution, products, assets: instAssets, total: instTotal }) => {
                                                const instKey = `${classification}-${institution}`;
                                                const isInstExpanded = expandedInstitutions.has(instKey);
                                                const instExpandable = isInstitutionExpandable(products, instAssets.length);
                                                const instWeightInClass = classTotal > 0 ? (instTotal / classTotal) * 100 : 0;
                                                const instWeightInTotal = totalWealth > 0 ? (instTotal / totalWealth) * 100 : 0;
                                                const { variation: instVariation, variationPct: instVariationPct } = calcGroupVariation(instAssets);
                                                const singleAsset = instAssets.length === 1 ? instAssets[0] : null;

                                                return (
                                                    <React.Fragment key={instKey}>
                                                        <tr
                                                            className={`group transition-colors ${instExpandable ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" : ""}`}
                                                            onClick={() => instExpandable && toggleInstitution(instKey)}
                                                        >
                                                            <td className="px-4 py-4 font-medium text-foreground">
                                                                <div className="flex items-center gap-2 sm:gap-3">
                                                                    {instExpandable && (
                                                                        <span className="material-symbols-outlined text-[16px] text-slate-400 transition-transform" style={{ transform: isInstExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>
                                                                            chevron_right
                                                                        </span>
                                                                    )}
                                                                    <div className="size-6 sm:size-8 rounded-full bg-primary/15 dark:bg-primary/20 flex items-center justify-center text-primary font-bold border border-primary/30 shadow-sm shrink-0 text-[10px] sm:text-sm">
                                                                        {institution.charAt(0).toUpperCase()}
                                                                    </div>
                                                                    <span className="truncate font-semibold">{institution}</span>
                                                                    {instExpandable && (
                                                                        <span className="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-full font-bold">{instAssets.length}</span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-4 text-slate-400 dark:text-slate-500 text-xs">
                                                                {!instExpandable && singleAsset
                                                                    ? singleAsset.Asset
                                                                    : instExpandable && !isInstExpanded
                                                                        ? t("portfolio.nAssets", { count: instAssets.length })
                                                                        : ""}
                                                            </td>
                                                            <td className="px-4 py-4 text-right font-medium text-foreground">{formatCurrency(instTotal)}</td>
                                                            <td className="px-4 py-4 text-right">
                                                                {instVariation !== null ? (
                                                                    <span className={`font-medium ${instVariation >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                                                                        {instVariation >= 0 ? "+" : ""}{formatAbbreviated(instVariation)}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-slate-400 dark:text-slate-500">—</span>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-4 text-right">
                                                                {instVariationPct !== null ? (
                                                                    <span className={`font-medium ${instVariationPct >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                                                                        {instVariationPct >= 0 ? "+" : ""}{instVariationPct.toFixed(1)}%
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-slate-400 dark:text-slate-500">—</span>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-4 text-right text-slate-500 dark:text-slate-400">{instWeightInClass.toFixed(1)}%</td>
                                                            <td className="px-4 py-4 text-right text-slate-500 dark:text-slate-400">{instWeightInTotal.toFixed(1)}%</td>
                                                        </tr>
                                                        {isInstExpanded && instExpandable && products.map(({ product, assets: prodAssets, total: prodTotal }) => {
                                                            const productKey = `${instKey}-${product}`;
                                                            const isProdExpanded = expandedProducts.has(productKey);
                                                            const prodExpandable = isProductExpandable(prodAssets);
                                                            const prodWeightInClass = classTotal > 0 ? (prodTotal / classTotal) * 100 : 0;
                                                            const prodWeightInTotal = totalWealth > 0 ? (prodTotal / totalWealth) * 100 : 0;
                                                            const { variation: prodVariation, variationPct: prodVariationPct } = calcGroupVariation(prodAssets);

                                                            return (
                                                                <React.Fragment key={productKey}>
                                                                    <tr
                                                                        className={`bg-slate-50/30 dark:bg-slate-900/20 transition-colors ${prodExpandable ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" : ""}`}
                                                                        onClick={(e) => { e.stopPropagation(); prodExpandable && toggleProduct(productKey); }}
                                                                    >
                                                                        <td className="px-4 py-3 pl-12"></td>
                                                                        <td className="px-4 py-3 font-medium text-foreground/90 text-xs">
                                                                            <div className="flex items-center gap-2">
                                                                                {prodExpandable && (
                                                                                    <span className="material-symbols-outlined text-[14px] text-slate-400 transition-transform" style={{ transform: isProdExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>
                                                                                        chevron_right
                                                                                    </span>
                                                                                )}
                                                                                <span className="truncate">{product}</span>
                                                                                {prodExpandable && (
                                                                                    <span className="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-full font-bold">{prodAssets.length}</span>
                                                                                )}
                                                                            </div>
                                                                        </td>
                                                                        <td className="px-4 py-3 text-right font-medium text-foreground/90 text-xs">{formatCurrency(prodTotal)}</td>
                                                                        <td className="px-4 py-3 text-right text-xs">
                                                                            {prodVariation !== null ? (
                                                                                <span className={`font-medium ${prodVariation >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                                                                                    {prodVariation >= 0 ? "+" : ""}{formatAbbreviated(prodVariation)}
                                                                                </span>
                                                                            ) : (
                                                                                <span className="text-slate-400 dark:text-slate-500">—</span>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-4 py-3 text-right text-xs">
                                                                            {prodVariationPct !== null ? (
                                                                                <span className={`font-medium ${prodVariationPct >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                                                                                    {prodVariationPct >= 0 ? "+" : ""}{prodVariationPct.toFixed(1)}%
                                                                                </span>
                                                                            ) : (
                                                                                <span className="text-slate-400 dark:text-slate-500">—</span>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-4 py-3 text-right text-slate-400 dark:text-slate-500 text-xs">{prodWeightInClass.toFixed(1)}%</td>
                                                                        <td className="px-4 py-3 text-right text-slate-400 dark:text-slate-500 text-xs">{prodWeightInTotal.toFixed(1)}%</td>
                                                                    </tr>
                                                                    {isProdExpanded && prodExpandable && prodAssets.map((asset, idx) => {
                                                                        const weightInClass = classTotal > 0 ? (asset.Value / classTotal) * 100 : 0;
                                                                        const weightInTotal = totalWealth > 0 ? (asset.Value / totalWealth) * 100 : 0;
                                                                        const { variation, variationPct } = renderAssetVariation(asset);

                                                                        return (
                                                                            <tr key={`${productKey}-${asset.Asset}-${idx}`} className="bg-slate-50/50 dark:bg-slate-900/30 transition-colors group">
                                                                                <td className="px-4 py-3 pl-16"></td>
                                                                                <td className="px-4 py-3 font-medium text-foreground/80 text-xs">
                                                                                    <div className="flex items-center gap-2 pl-4">
                                                                                        <div className="size-5 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 text-[8px] font-bold shrink-0">
                                                                                            {asset.Asset.charAt(0).toUpperCase()}
                                                                                        </div>
                                                                                        <span className="truncate">{asset.Asset}</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td className="px-4 py-3 text-right font-medium text-foreground/80 text-xs">{formatCurrency(asset.Value)}</td>
                                                                                <td className="px-4 py-3 text-right text-xs">
                                                                                    {variation !== null ? (
                                                                                        <span className={`font-medium ${variation >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                                                                                            {variation >= 0 ? "+" : ""}{formatAbbreviated(variation)}
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span className="text-slate-400 dark:text-slate-500">—</span>
                                                                                    )}
                                                                                </td>
                                                                                <td className="px-4 py-3 text-right text-xs">
                                                                                    {variationPct !== null ? (
                                                                                        <span className={`font-medium ${variationPct >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                                                                                            {variationPct >= 0 ? "+" : ""}{variationPct.toFixed(1)}%
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span className="text-slate-400 dark:text-slate-500">—</span>
                                                                                    )}
                                                                                </td>
                                                                                <td className="px-4 py-3 text-right text-slate-400 dark:text-slate-500 text-xs">{weightInClass.toFixed(1)}%</td>
                                                                                <td className="px-4 py-3 text-right text-slate-400 dark:text-slate-500 text-xs">{weightInTotal.toFixed(1)}%</td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </React.Fragment>
                                                            );
                                                        })}
                                                    </React.Fragment>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        );
                    })
                )}

                {/* Evolução por Instituição Section */}
                {sortedInstGrouped.length > 0 && (
                    <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-5 fade-in duration-700 mt-4">
                        <div className="flex items-center gap-4">
                            <div className="h-px bg-border flex-1"></div>
                            <h2 className="text-xl font-bold text-foreground">{t("portfolio.evolutionByInstitution")}</h2>
                            <div className="h-px bg-border flex-1"></div>
                        </div>

                        <div className="rounded-xl bg-surface border border-border shadow-sm overflow-hidden">
                            <div className="px-6 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-background/50">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary text-[20px]">account_balance</span>
                                    <h3 className="text-lg font-bold text-foreground">{t("portfolio.institutionsSummary")}</h3>
                                </div>
                                <div className="flex items-center gap-4 text-sm">
                                    <span className="font-bold text-foreground">{formatCurrency(totalWealth)}</span>
                                    <span className="text-slate-400 dark:text-slate-500">|</span>
                                    {wealthVariationAbs !== null && (
                                        <>
                                            <span className={`font-semibold ${wealthVariationAbs >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                                                {wealthVariationAbs >= 0 ? "+" : ""}{formatAbbreviated(wealthVariationAbs)}
                                            </span>
                                            <span className="text-slate-400 dark:text-slate-500">|</span>
                                        </>
                                    )}
                                    {wealthVariationPct === null ? (
                                        <span className="font-semibold text-slate-400 dark:text-slate-500">—</span>
                                    ) : (
                                        <span className="font-semibold flex items-center gap-1">
                                            <span className={`material-symbols-outlined text-[16px] ${wealthVariationPct >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                                                {wealthVariationPct >= 0 ? "trending_up" : "trending_down"}
                                            </span>
                                            <span className={wealthVariationPct >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}>
                                                {wealthVariationPct >= 0 ? "+" : ""}{wealthVariationPct.toFixed(1)}%
                                            </span>
                                            <span className="text-slate-600 dark:text-slate-300 text-xs font-semibold">{t("dashboard.vsLastMonth")}</span>
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="sm:hidden p-4 space-y-3">
                                {sortedInstGrouped.map(({ institution, products, assets: instAssets, total: instTotal }) => {
                                    const globalInstKey = `global-inst-${institution}`;
                                    const isInstExpanded = expandedInstitutions.has(globalInstKey);
                                    const instExpandable = isInstitutionExpandable(products, instAssets.length);
                                    const instWeightInTotal = totalWealth > 0 ? (instTotal / totalWealth) * 100 : 0;
                                    const instPrevTotal = prevInstTotals[institution] || 0;
                                    const instVariation = instPrevTotal > 0 ? instTotal - instPrevTotal : null;
                                    const instVariationPct = instPrevTotal > 0 ? ((instTotal - instPrevTotal) / instPrevTotal) * 100 : null;

                                    return (
                                        <div
                                            key={`${globalInstKey}-mobile`}
                                            className={`rounded-xl border border-border bg-slate-50/80 dark:bg-slate-900/40 p-4 space-y-3 ${instExpandable ? "cursor-pointer active:bg-slate-100 dark:active:bg-slate-800/60" : ""}`}
                                            onClick={() => instExpandable && toggleInstitution(globalInstKey)}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    {instExpandable && (
                                                        <span
                                                            className="material-symbols-outlined text-[16px] text-slate-400 transition-transform shrink-0"
                                                            style={{ transform: isInstExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
                                                        >
                                                            chevron_right
                                                        </span>
                                                    )}
                                                    <div className="size-8 rounded-full bg-primary/15 dark:bg-primary/20 flex items-center justify-center text-primary font-bold border border-primary/30 shadow-sm shrink-0 text-sm">
                                                        {institution.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-semibold text-foreground truncate">{institution}</p>
                                                        {instExpandable && !isInstExpanded && (
                                                            <p className="text-xs text-slate-500 dark:text-slate-400">{t("portfolio.nAssets", { count: instAssets.length })}</p>
                                                        )}
                                                    </div>
                                                </div>
                                                <p className="text-lg font-black text-foreground tabular-nums shrink-0">{formatCurrency(instTotal)}</p>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{t("portfolio.monthAbsVar")}</p>
                                                    {instVariation !== null ? (
                                                        <p className={`text-sm font-semibold tabular-nums ${instVariation >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                                                            {instVariation >= 0 ? "+" : ""}{formatAbbreviated(instVariation)}
                                                        </p>
                                                    ) : (
                                                        <p className="text-sm text-slate-400 dark:text-slate-500">—</p>
                                                    )}
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{t("portfolio.monthVar")}</p>
                                                    {instVariationPct !== null ? (
                                                        <p className={`text-sm font-semibold tabular-nums ${instVariationPct >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                                                            {instVariationPct >= 0 ? "+" : ""}{instVariationPct.toFixed(1)}%
                                                        </p>
                                                    ) : (
                                                        <p className="text-sm text-slate-400 dark:text-slate-500">—</p>
                                                    )}
                                                </div>
                                                <div className="col-span-2">
                                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{t("portfolio.weightTotal")}</p>
                                                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 tabular-nums">{instWeightInTotal.toFixed(1)}%</p>
                                                </div>
                                            </div>
                                            {isInstExpanded && instExpandable && (
                                                <div className="pt-2 border-t border-border/60 space-y-2" onClick={(e) => e.stopPropagation()}>
                                                    {products.map(({ product, assets: prodAssets, total: prodTotal }) => {
                                                        const productKey = `${globalInstKey}-${product}`;
                                                        const isProdExpanded = expandedProducts.has(productKey);
                                                        const prodExpandable = isProductExpandable(prodAssets);
                                                        const { variation: prodVariation, variationPct: prodVariationPct } = calcGroupVariation(prodAssets);

                                                        return (
                                                            <div key={productKey} className="space-y-1.5">
                                                                <div
                                                                    className={`flex items-center justify-between gap-2 py-1.5 ${prodExpandable ? "cursor-pointer" : ""}`}
                                                                    onClick={() => prodExpandable && toggleProduct(productKey)}
                                                                >
                                                                    <div className="flex items-center gap-2 min-w-0">
                                                                        {prodExpandable && (
                                                                            <span
                                                                                className="material-symbols-outlined text-[14px] text-slate-400 transition-transform shrink-0"
                                                                                style={{ transform: isProdExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
                                                                            >
                                                                                chevron_right
                                                                            </span>
                                                                        )}
                                                                        <span className="text-xs font-semibold text-foreground/90 truncate">{product}</span>
                                                                    </div>
                                                                    <div className="text-right shrink-0">
                                                                        <p className="text-xs font-semibold text-foreground tabular-nums">{formatCurrency(prodTotal)}</p>
                                                                        {prodVariation !== null && (
                                                                            <p className={`text-[10px] tabular-nums ${prodVariation >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                                                                                {prodVariation >= 0 ? "+" : ""}{formatAbbreviated(prodVariation)}
                                                                                {prodVariationPct !== null && ` (${prodVariationPct >= 0 ? "+" : ""}${prodVariationPct.toFixed(1)}%)`}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                {isProdExpanded && prodExpandable && prodAssets.map((asset, aIdx) => {
                                                                    const prevValue = getPrevValue(asset);
                                                                    const variation = prevValue !== null ? asset.Value - prevValue : null;
                                                                    const variationPct = prevValue !== null && prevValue !== 0 ? (variation! / prevValue) * 100 : null;

                                                                    return (
                                                                        <div key={`${productKey}-m-${asset.Asset}-${aIdx}`} className="flex items-center justify-between gap-2 py-1 pl-5">
                                                                            <div className="flex items-center gap-2 min-w-0">
                                                                                <div className="size-5 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 text-[8px] font-bold shrink-0">
                                                                                    {asset.Asset.charAt(0).toUpperCase()}
                                                                                </div>
                                                                                <span className="text-xs font-medium text-foreground/80 truncate">{asset.Asset}</span>
                                                                            </div>
                                                                            <div className="text-right shrink-0">
                                                                                <p className="text-xs font-semibold text-foreground tabular-nums">{formatCurrency(asset.Value)}</p>
                                                                                <p className="text-[10px] tabular-nums">
                                                                                    {variation !== null ? (
                                                                                        <span className={variation >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}>
                                                                                            {variation >= 0 ? "+" : ""}{formatAbbreviated(variation)}
                                                                                            {variationPct !== null && ` (${variationPct >= 0 ? "+" : ""}${variationPct.toFixed(1)}%)`}
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span className="text-slate-400 dark:text-slate-500">—</span>
                                                                                    )}
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="hidden sm:block overflow-x-auto">
                                <table className="w-full min-w-[700px] text-left border-collapse table-fixed">
                                    <thead>
                                        <tr className="bg-surface text-[10px] sm:text-xs uppercase text-slate-500 font-bold tracking-wider">
                                            <th className="px-4 py-3 w-[25%] sm:w-[25%]">{t("portfolio.institution")}</th>
                                            <th className="px-4 py-3 text-right w-[15%] sm:w-[15%]">{t("portfolio.currentValue")}</th>
                                            <th className="px-4 py-3 text-right w-[15%] sm:w-[15%]">{t("portfolio.monthAbsVar")}</th>
                                            <th className="px-4 py-3 text-right w-[15%] sm:w-[15%]">{t("portfolio.monthVar")}</th>
                                            <th className="px-4 py-3 text-right w-[15%] sm:w-[15%]">{t("portfolio.weightTotal")}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border text-xs sm:text-sm">
                                        {sortedInstGrouped.map(({ institution, products, assets: instAssets, total: instTotal }) => {
                                            const globalInstKey = `global-inst-${institution}`;
                                            const isInstExpanded = expandedInstitutions.has(globalInstKey);
                                            const instExpandable = isInstitutionExpandable(products, instAssets.length);
                                            const instWeightInTotal = totalWealth > 0 ? (instTotal / totalWealth) * 100 : 0;
                                            const instPrevTotal = prevInstTotals[institution] || 0;
                                            const instVariation = instPrevTotal > 0 ? instTotal - instPrevTotal : null;
                                            const instVariationPct = instPrevTotal > 0 ? ((instTotal - instPrevTotal) / instPrevTotal) * 100 : null;

                                            return (
                                                <React.Fragment key={globalInstKey}>
                                                    <tr
                                                        className={`group transition-colors ${instExpandable ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" : ""}`}
                                                        onClick={() => instExpandable && toggleInstitution(globalInstKey)}
                                                    >
                                                        <td className="px-4 py-4 font-medium text-foreground">
                                                            <div className="flex items-center gap-2 sm:gap-3">
                                                                {instExpandable ? (
                                                                    <span className="material-symbols-outlined text-[16px] text-slate-400 transition-transform" style={{ transform: isInstExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>
                                                                        chevron_right
                                                                    </span>
                                                                ) : (
                                                                    <div className="size-6 sm:size-8 rounded-full bg-transparent flex items-center justify-center border-transparent shrink-0 text-[10px] sm:text-sm w-[16px] opacity-0 pointer-events-none"></div>
                                                                )}
                                                                <div className="size-6 sm:size-8 rounded-full bg-primary/15 dark:bg-primary/20 flex items-center justify-center text-primary font-bold border border-primary/30 shadow-sm shrink-0 text-[10px] sm:text-sm">
                                                                    {institution.charAt(0).toUpperCase()}
                                                                </div>
                                                                <span className="truncate font-semibold">{institution}</span>
                                                                {instExpandable && (
                                                                    <span className="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-full font-bold">{instAssets.length}</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-4 text-right font-medium text-foreground">{formatCurrency(instTotal)}</td>
                                                        <td className="px-4 py-4 text-right">
                                                            {instVariation !== null ? (
                                                                <span className={`font-medium ${instVariation >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                                                                    {instVariation >= 0 ? "+" : ""}{formatAbbreviated(instVariation)}
                                                                </span>
                                                            ) : (
                                                                <span className="text-slate-400 dark:text-slate-500">—</span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-4 text-right">
                                                            {instVariationPct !== null ? (
                                                                <span className={`font-medium ${instVariationPct >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                                                                    {instVariationPct >= 0 ? "+" : ""}{instVariationPct.toFixed(1)}%
                                                                </span>
                                                            ) : (
                                                                <span className="text-slate-400 dark:text-slate-500">—</span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-4 text-right text-slate-500 dark:text-slate-400">{instWeightInTotal.toFixed(1)}%</td>
                                                    </tr>
                                                    {isInstExpanded && instExpandable && products.map(({ product, assets: prodAssets, total: prodTotal }) => {
                                                        const productKey = `${globalInstKey}-${product}`;
                                                        const isProdExpanded = expandedProducts.has(productKey);
                                                        const prodExpandable = isProductExpandable(prodAssets);
                                                        const prodWeightInTotal = totalWealth > 0 ? (prodTotal / totalWealth) * 100 : 0;
                                                        const { variation: prodVariation, variationPct: prodVariationPct } = calcGroupVariation(prodAssets);

                                                        return (
                                                            <React.Fragment key={productKey}>
                                                                <tr
                                                                    className={`bg-slate-50/30 dark:bg-slate-900/20 transition-colors ${prodExpandable ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" : ""}`}
                                                                    onClick={(e) => { e.stopPropagation(); prodExpandable && toggleProduct(productKey); }}
                                                                >
                                                                    <td className="px-4 py-3 pl-12 font-medium text-foreground/90 text-xs">
                                                                        <div className="flex items-center gap-2">
                                                                            {prodExpandable && (
                                                                                <span className="material-symbols-outlined text-[14px] text-slate-400 transition-transform" style={{ transform: isProdExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>
                                                                                    chevron_right
                                                                                </span>
                                                                            )}
                                                                            <span className="truncate">{product}</span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-4 py-3 text-right font-medium text-foreground/90 text-xs">{formatCurrency(prodTotal)}</td>
                                                                    <td className="px-4 py-3 text-right text-xs">
                                                                        {prodVariation !== null ? (
                                                                            <span className={`font-medium ${prodVariation >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                                                                                {prodVariation >= 0 ? "+" : ""}{formatAbbreviated(prodVariation)}
                                                                            </span>
                                                                        ) : (
                                                                            <span className="text-slate-400 dark:text-slate-500">—</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-right text-xs">
                                                                        {prodVariationPct !== null ? (
                                                                            <span className={`font-medium ${prodVariationPct >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                                                                                {prodVariationPct >= 0 ? "+" : ""}{prodVariationPct.toFixed(1)}%
                                                                            </span>
                                                                        ) : (
                                                                            <span className="text-slate-400 dark:text-slate-500">—</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-right text-slate-400 dark:text-slate-500 text-xs">{prodWeightInTotal.toFixed(1)}%</td>
                                                                </tr>
                                                                {isProdExpanded && prodExpandable && prodAssets.map((asset, aIdx) => {
                                                                    const weightInTotal = totalWealth > 0 ? (asset.Value / totalWealth) * 100 : 0;
                                                                    const prevValue = getPrevValue(asset);
                                                                    const variation = prevValue !== null ? asset.Value - prevValue : null;
                                                                    const variationPct = prevValue !== null && prevValue !== 0 ? (variation! / prevValue) * 100 : null;

                                                                    return (
                                                                        <tr key={`${productKey}-${asset.Asset}-${aIdx}`} className="bg-slate-50/50 dark:bg-slate-900/30 transition-colors group">
                                                                            <td className="px-4 py-3 pl-16 font-medium text-foreground/80 text-xs">
                                                                                <div className="flex items-center gap-2">
                                                                                    <div className="size-5 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 text-[8px] font-bold shrink-0">
                                                                                        {asset.Asset.charAt(0).toUpperCase()}
                                                                                    </div>
                                                                                    <span className="truncate">{asset.Asset}</span>
                                                                                </div>
                                                                            </td>
                                                                            <td className="px-4 py-3 text-right font-medium text-foreground/80 text-xs">{formatCurrency(asset.Value)}</td>
                                                                            <td className="px-4 py-3 text-right text-xs">
                                                                                {variation !== null ? (
                                                                                    <span className={`font-medium ${variation >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                                                                                        {variation >= 0 ? "+" : ""}{formatAbbreviated(variation)}
                                                                                    </span>
                                                                                ) : (
                                                                                    <span className="text-slate-400 dark:text-slate-500">—</span>
                                                                                )}
                                                                            </td>
                                                                            <td className="px-4 py-3 text-right text-xs">
                                                                                {variationPct !== null ? (
                                                                                    <span className={`font-medium ${variationPct >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                                                                                        {variationPct >= 0 ? "+" : ""}{variationPct.toFixed(1)}%
                                                                                    </span>
                                                                                ) : (
                                                                                    <span className="text-slate-400 dark:text-slate-500">—</span>
                                                                                )}
                                                                            </td>
                                                                            <td className="px-4 py-3 text-right text-slate-400 dark:text-slate-500 text-xs">{weightInTotal.toFixed(1)}%</td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                </React.Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* Evolution Chart with Filters */}
                {uniqueDates.length > 0 && (
                    <div className="rounded-xl bg-surface border border-border shadow-sm p-6 flex flex-col animate-in slide-in-from-bottom-6 fade-in duration-700">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                            <h3 className="text-lg font-bold text-foreground">{t("portfolio.evolutionChart")}</h3>
                            <div className="flex items-center gap-2">
                                <select
                                    value={filterClassification}
                                    onChange={(e) => setClassification(e.target.value)}
                                    className="rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none min-w-[140px]"
                                >
                                    <option value="">{t("portfolio.allClassifications")}</option>
                                    {classifications.map((c) => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                                <span className="text-slate-400 text-sm">/</span>
                                <select
                                    value={filterInstitution}
                                    onChange={(e) => setInstitution(e.target.value)}
                                    className="rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none min-w-[140px]"
                                >
                                    <option value="">{t("portfolio.allInstitutions")}</option>
                                    {institutionsList.map((i) => (
                                        <option key={i} value={i}>{i}</option>
                                    ))}
                                </select>
                                <span className="text-slate-400 text-sm">/</span>
                                <select
                                    value={filterProductType}
                                    onChange={(e) => setProductTypeFilter(e.target.value)}
                                    className="rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none min-w-[140px]"
                                >
                                    <option value="">{t("portfolio.allProductTypes")}</option>
                                    {productTypesList.map((p) => (
                                        <option key={p} value={p}>{p}</option>
                                    ))}
                                </select>
                                <span className="text-slate-400 text-sm">/</span>
                                <select
                                    value={filterAsset}
                                    onChange={(e) => setFilterAsset(e.target.value)}
                                    className="rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none min-w-[120px]"
                                >
                                    <option value="">{t("portfolio.allAssets")}</option>
                                    {assetsList.map((a) => (
                                        <option key={a} value={a}>{a}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div
                            className="w-full h-[300px] relative cursor-crosshair select-none"
                            {...portfolioBrush.containerHandlers}
                        >
                            {portfolioBrush.variation && (
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
                                    <span style={{ color: portfolioBrush.variation.absolute >= 0 ? "#22c55e" : "#ef4444" }}>
                                        {formatCurrency(portfolioBrush.variation.absolute)} ({portfolioBrush.variation.percent >= 0 ? "+" : ""}{portfolioBrush.variation.percent.toFixed(1)}%)
                                    </span>
                                </div>
                            )}
                            <ResponsiveContainer width="100%" height={300}>
                                <AreaChart
                                    data={chartData}
                                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                                    {...portfolioBrush.chartHandlers}
                                >
                                    <defs>
                                        <linearGradient id="colorPortfolioValue" x1="0" y1="0" x2="0" y2="1">
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
                                        tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                                        stroke={chartTickColor}
                                    />
                                    <RechartsTooltip
                                        cursor={false}
                                        content={({ active, payload }) => (portfolioBrush.isDragging ? null : active && payload?.length ? (
                                            <div className="rounded-lg px-3 py-2 border shadow" style={{ backgroundColor: tooltipBg, borderColor: tooltipBorder, boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.2)", color: tooltipTextColor }}>
                                                <p style={{ color: tooltipLabelColor }}>{payload[0].payload?.name}</p>
                                                <p>{t("dashboard.wealth")}: {formatCurrency(payload[0].value as number)}</p>
                                            </div>
                                        ) : null)}
                                        wrapperStyle={{ zIndex: 9999 }}
                                    />
                                    {portfolioBrush.selectionBounds && chartData[portfolioBrush.selectionBounds[0]] && chartData[portfolioBrush.selectionBounds[1]] && (
                                        <ReferenceArea
                                            x1={chartData[portfolioBrush.selectionBounds[0]].name}
                                            x2={chartData[portfolioBrush.selectionBounds[1]].name}
                                            fill="#137fec"
                                            fillOpacity={0.15}
                                            strokeOpacity={0}
                                        />
                                    )}
                                    <Area type="monotone" dataKey="value" stroke="#137fec" strokeWidth={3} fillOpacity={1} fill="url(#colorPortfolioValue)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
