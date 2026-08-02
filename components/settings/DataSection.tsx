"use client";

import { useEffect, useRef, useState } from "react";
import { AssetEntry } from "@/types/database";
import { useTranslation } from "@/lib/i18n";
import { cn, parseCustomDate, firstOfMonthDbDate } from "@/lib/utils";
import MonthYearPicker from "@/components/MonthYearPicker";
import { FormattedNumberInput } from "@/components/FormattedNumberInput";
import { EmptyHint } from "./EmptyHint";

export type DataSectionRow = { row: AssetEntry; originalIndex: number };

export type AssetSortConfig = {
    key: keyof AssetEntry;
    direction: "asc" | "desc";
} | null;

export interface DataSectionProps {
    data: AssetEntry[];
    rows: DataSectionRow[];
    classifications: string[];
    institutions: string[];
    productTypes: string[];
    assets: string[];
    editingRowIndex: number | null;
    onEditingRowIndexChange: (index: number | null) => void;
    onDataChange: (originalIndex: number, field: keyof AssetEntry, value: string | number) => void;
    sortConfig: AssetSortConfig;
    onSort: (key: keyof AssetEntry) => void;
    selectedClassifications: string[];
    selectedInstitutions: string[];
    selectedProductTypes: string[];
    selectedAssets: string[];
    onToggleClassificationFilter: (value: string) => void;
    onToggleInstitutionFilter: (value: string) => void;
    onToggleProductTypeFilter: (value: string) => void;
    onToggleAssetFilter: (value: string) => void;
    onClearClassificationFilters: () => void;
    onClearInstitutionFilters: () => void;
    onClearProductTypeFilters: () => void;
    onClearAssetFilters: () => void;
    onDeleteRow: (originalIndex: number) => void;
    onPreview: () => void;
    previewLabel?: string;
}

type FilterKey = "classification" | "institution" | "product" | "asset";

const selectClass =
    "bg-transparent border-b border-border/40 focus:border-primary focus:outline-none py-1 w-full text-xs font-bold transition-colors appearance-none";
const cellInputClass =
    "bg-transparent border-b border-border/40 focus:border-primary focus:outline-none py-1 w-full text-right tabular-nums font-bold text-foreground";

function FilterDropdown({
    label,
    options,
    selected,
    onToggle,
    onClear,
    open,
    onOpenChange,
}: {
    label: string;
    options: string[];
    selected: string[];
    onToggle: (value: string) => void;
    onClear: () => void;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const { t } = useTranslation();
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onOpenChange(false);
        };
        document.addEventListener("mousedown", onOutside);
        return () => document.removeEventListener("mousedown", onOutside);
    }, [open, onOpenChange]);

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    onOpenChange(!open);
                }}
                className={cn(
                    "flex items-center justify-center size-6 rounded-md transition-all cursor-pointer",
                    selected.length > 0
                        ? "bg-primary text-white scale-110"
                        : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-300 hover:text-slate-500"
                )}
            >
                <span className="material-symbols-outlined text-[14px]">filter_alt</span>
            </button>
            {open && (
                <div className="absolute right-0 mt-3 w-64 p-4 bg-surface border border-border/60 rounded-xl shadow-2xl z-50 animate-in fade-in zoom-in slide-in-from-top-2 duration-200 backdrop-blur-xl">
                    <div className="flex justify-between items-center mb-4">
                        <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">{label}</span>
                        {selected.length > 0 && (
                            <button
                                type="button"
                                onClick={onClear}
                                className="text-[10px] font-bold text-primary hover:opacity-70 transition-opacity uppercase"
                            >
                                {t("settings.clearFilters")}
                            </button>
                        )}
                    </div>
                    <div className="max-h-64 overflow-y-auto space-y-0.5 pr-1 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
                        {options.map((opt) => (
                            <label
                                key={opt}
                                className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer text-sm normal-case font-medium text-slate-600 dark:text-slate-400 hover:text-foreground"
                            >
                                <input
                                    type="checkbox"
                                    className="rounded-[4px] border-slate-300 dark:border-slate-700 text-primary focus:ring-primary/20 size-3.5 transition-all"
                                    checked={selected.includes(opt)}
                                    onChange={() => onToggle(opt)}
                                    onClick={(e) => e.stopPropagation()}
                                />
                                <span className="truncate">{opt}</span>
                            </label>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function SortIcon({ active, direction }: { active: boolean; direction: "asc" | "desc" }) {
    if (!active) {
        return (
            <span className="material-symbols-outlined text-[14px] opacity-0 group-hover:opacity-40 transition-opacity">
                unfold_more
            </span>
        );
    }
    return (
        <span className="material-symbols-outlined text-[14px] text-primary">
            {direction === "asc" ? "expand_less" : "expand_more"}
        </span>
    );
}

function FieldSelect({
    value,
    options,
    onChange,
}: {
    value: string;
    options: string[];
    onChange: (v: string) => void;
}) {
    return (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
            <option value={value}>{value}</option>
            {options
                .filter((o) => o !== value)
                .sort((a, b) => a.localeCompare(b))
                .map((o) => (
                    <option key={o} value={o}>
                        {o}
                    </option>
                ))}
        </select>
    );
}

export function DataSection({
    data,
    rows,
    classifications,
    institutions,
    productTypes,
    assets,
    editingRowIndex,
    onEditingRowIndexChange,
    onDataChange,
    sortConfig,
    onSort,
    selectedClassifications,
    selectedInstitutions,
    selectedProductTypes,
    selectedAssets,
    onToggleClassificationFilter,
    onToggleInstitutionFilter,
    onToggleProductTypeFilter,
    onToggleAssetFilter,
    onClearClassificationFilters,
    onClearInstitutionFilters,
    onClearProductTypeFilters,
    onClearAssetFilters,
    onDeleteRow,
    onPreview,
    previewLabel,
}: DataSectionProps) {
    const { t, formatCurrency } = useTranslation();
    const [openFilter, setOpenFilter] = useState<FilterKey | null>(null);

    const renderSortIcon = (key: keyof AssetEntry) => (
        <SortIcon active={sortConfig?.key === key} direction={sortConfig?.direction ?? "asc"} />
    );

    const renderDateEditor = (row: AssetEntry, originalIndex: number) => {
        const d = parseCustomDate(row.Date);
        return (
            <MonthYearPicker
                year={d.getUTCFullYear()}
                month={d.getUTCMonth()}
                onChange={(y, m) => onDataChange(originalIndex, "Date", firstOfMonthDbDate(y, m))}
                className="min-w-[240px]"
            />
        );
    };

    const renderRowActions = (originalIndex: number, compact?: boolean) => {
        const editing = editingRowIndex === originalIndex;
        if (editing) {
            return (
                <div className={cn("flex gap-2", compact ? "justify-end" : "justify-center gap-3")}>
                    <button
                        type="button"
                        onClick={() => onEditingRowIndexChange(null)}
                        className="text-primary hover:opacity-70 transition-all"
                        aria-label={t("common.confirm")}
                    >
                        <span className="material-symbols-outlined text-[20px]">check_circle</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => onEditingRowIndexChange(null)}
                        className="text-slate-300 hover:text-slate-500 transition-all"
                        aria-label={t("common.cancel")}
                    >
                        <span className="material-symbols-outlined text-[20px]">cancel</span>
                    </button>
                </div>
            );
        }
        return (
            <div
                className={cn(
                    "flex gap-2",
                    compact ? "justify-end" : "justify-center opacity-0 group-hover/row:opacity-100 transition-all"
                )}
            >
                <button
                    type="button"
                    onClick={() => onEditingRowIndexChange(originalIndex)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-primary/10 text-slate-400 hover:text-primary transition-all"
                    aria-label={t("settings.editCells")}
                >
                    <span className="material-symbols-outlined text-[16px]">edit</span>
                </button>
                <button
                    type="button"
                    onClick={() => onDeleteRow(originalIndex)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-all"
                    aria-label={t("settings.deleteRecord")}
                >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                </button>
            </div>
        );
    };

    if (rows.length === 0) {
        return (
            <div className="rounded-xl bg-surface border border-border/60 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-background/50">
                    <div>
                        <h3 className="text-lg font-bold text-foreground tracking-tight">{t("settings.rawDatabase")}</h3>
                        <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mt-0.5">
                            {t("settings.editCells")}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onPreview}
                        className="self-start px-4 py-2 rounded-lg text-sm font-bold text-foreground border border-border hover:bg-border transition-colors"
                    >
                        {previewLabel ?? t("settings.previewChanges")}
                    </button>
                </div>
                <div className="p-6">
                    <EmptyHint
                        title={t("settings.dataEmptyTitle")}
                        description={t("settings.dataEmptyDesc")}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-xl bg-surface border border-border/60 shadow-sm flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-background/50 backdrop-blur-md">
                <div>
                    <h3 className="text-lg font-bold text-foreground tracking-tight">{t("settings.rawDatabase")}</h3>
                    <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mt-0.5">
                        {t("settings.editCells")} · {rows.length}/{data.length}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onPreview}
                    className="self-start px-4 py-2 rounded-lg text-sm font-bold text-foreground border border-border hover:bg-border transition-colors"
                >
                    {previewLabel ?? t("settings.previewChanges")}
                </button>
            </div>

            <div className="sm:hidden p-4 space-y-3 border-b border-border/40 bg-background/30">
                <div className="flex flex-wrap gap-2">
                    <FilterDropdown
                        label={t("settings.classifications")}
                        options={classifications}
                        selected={selectedClassifications}
                        onToggle={onToggleClassificationFilter}
                        onClear={onClearClassificationFilters}
                        open={openFilter === "classification"}
                        onOpenChange={(open) => setOpenFilter(open ? "classification" : null)}
                    />
                    <span className="text-xs font-bold text-slate-500 self-center">{t("settings.classification")}</span>
                    {selectedClassifications.length > 0 && (
                        <span className="text-[10px] font-bold text-primary">{selectedClassifications.length}</span>
                    )}
                </div>
                <div className="flex flex-wrap gap-2">
                    <FilterDropdown
                        label={t("portfolio.institution")}
                        options={institutions}
                        selected={selectedInstitutions}
                        onToggle={onToggleInstitutionFilter}
                        onClear={onClearInstitutionFilters}
                        open={openFilter === "institution"}
                        onOpenChange={(open) => setOpenFilter(open ? "institution" : null)}
                    />
                    <span className="text-xs font-bold text-slate-500 self-center">{t("portfolio.institution")}</span>
                    {selectedInstitutions.length > 0 && (
                        <span className="text-[10px] font-bold text-primary">{selectedInstitutions.length}</span>
                    )}
                </div>
                <div className="flex flex-wrap gap-2">
                    <FilterDropdown
                        label={t("settings.productTypes")}
                        options={productTypes}
                        selected={selectedProductTypes}
                        onToggle={onToggleProductTypeFilter}
                        onClear={onClearProductTypeFilters}
                        open={openFilter === "product"}
                        onOpenChange={(open) => setOpenFilter(open ? "product" : null)}
                    />
                    <span className="text-xs font-bold text-slate-500 self-center">{t("settings.productType")}</span>
                    {selectedProductTypes.length > 0 && (
                        <span className="text-[10px] font-bold text-primary">{selectedProductTypes.length}</span>
                    )}
                </div>
                <div className="flex flex-wrap gap-2">
                    <FilterDropdown
                        label={t("settings.assets")}
                        options={assets}
                        selected={selectedAssets}
                        onToggle={onToggleAssetFilter}
                        onClear={onClearAssetFilters}
                        open={openFilter === "asset"}
                        onOpenChange={(open) => setOpenFilter(open ? "asset" : null)}
                    />
                    <span className="text-xs font-bold text-slate-500 self-center">{t("settings.asset")}</span>
                    {selectedAssets.length > 0 && (
                        <span className="text-[10px] font-bold text-primary">{selectedAssets.length}</span>
                    )}
                </div>
            </div>

            <div className="hidden sm:block overflow-x-auto max-h-[400px] overflow-y-auto relative scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
                <table className="w-full text-left border-separate border-spacing-0">
                    <thead className="sticky top-0 z-20 bg-surface/95 backdrop-blur-md font-bold">
                        <tr className="text-[10px] uppercase text-slate-400 tracking-[0.1em]">
                            <th
                                className="px-6 py-3 border-b border-border/40 bg-transparent group cursor-pointer select-none transition-colors hover:text-primary"
                                onClick={() => onSort("Date")}
                            >
                                <div className="flex items-center gap-2">
                                    {t("settings.date")}
                                    {renderSortIcon("Date")}
                                </div>
                            </th>
                            <th className="px-6 py-3 border-b border-border/40 bg-transparent group relative">
                                <div className="flex items-center justify-between gap-2">
                                    <div
                                        className="flex items-center gap-2 cursor-pointer select-none grow transition-colors hover:text-primary"
                                        onClick={() => onSort("Classification")}
                                    >
                                        {t("settings.classification")}
                                        {renderSortIcon("Classification")}
                                    </div>
                                    <FilterDropdown
                                        label={t("settings.classifications")}
                                        options={classifications}
                                        selected={selectedClassifications}
                                        onToggle={onToggleClassificationFilter}
                                        onClear={onClearClassificationFilters}
                                        open={openFilter === "classification"}
                                        onOpenChange={(open) => setOpenFilter(open ? "classification" : null)}
                                    />
                                </div>
                            </th>
                            <th className="px-6 py-3 border-b border-border/40 bg-transparent group relative">
                                <div className="flex items-center justify-between gap-2">
                                    <div
                                        className="flex items-center gap-2 cursor-pointer select-none grow transition-colors hover:text-primary"
                                        onClick={() => onSort("Institution")}
                                    >
                                        {t("portfolio.institution")}
                                        {renderSortIcon("Institution")}
                                    </div>
                                    <FilterDropdown
                                        label={t("portfolio.institution")}
                                        options={institutions}
                                        selected={selectedInstitutions}
                                        onToggle={onToggleInstitutionFilter}
                                        onClear={onClearInstitutionFilters}
                                        open={openFilter === "institution"}
                                        onOpenChange={(open) => setOpenFilter(open ? "institution" : null)}
                                    />
                                </div>
                            </th>
                            <th className="px-6 py-3 border-b border-border/40 bg-transparent group relative">
                                <div className="flex items-center justify-between gap-2">
                                    <div
                                        className="flex items-center gap-2 cursor-pointer select-none grow transition-colors hover:text-primary"
                                        onClick={() => onSort("ProductType")}
                                    >
                                        {t("settings.productType")}
                                        {renderSortIcon("ProductType")}
                                    </div>
                                    <FilterDropdown
                                        label={t("settings.productTypes")}
                                        options={productTypes}
                                        selected={selectedProductTypes}
                                        onToggle={onToggleProductTypeFilter}
                                        onClear={onClearProductTypeFilters}
                                        open={openFilter === "product"}
                                        onOpenChange={(open) => setOpenFilter(open ? "product" : null)}
                                    />
                                </div>
                            </th>
                            <th className="px-6 py-3 border-b border-border/40 bg-transparent group relative">
                                <div className="flex items-center justify-between gap-2">
                                    <div
                                        className="flex items-center gap-2 cursor-pointer select-none grow transition-colors hover:text-primary"
                                        onClick={() => onSort("Asset")}
                                    >
                                        {t("settings.asset")}
                                        {renderSortIcon("Asset")}
                                    </div>
                                    <FilterDropdown
                                        label={t("settings.assets")}
                                        options={assets}
                                        selected={selectedAssets}
                                        onToggle={onToggleAssetFilter}
                                        onClear={onClearAssetFilters}
                                        open={openFilter === "asset"}
                                        onOpenChange={(open) => setOpenFilter(open ? "asset" : null)}
                                    />
                                </div>
                            </th>
                            <th
                                className="px-6 py-3 border-b border-border/40 bg-transparent text-right group cursor-pointer select-none transition-colors hover:text-primary"
                                onClick={() => onSort("Value")}
                            >
                                <div className="flex items-center justify-end gap-2">
                                    {t("settings.value")}
                                    {renderSortIcon("Value")}
                                </div>
                            </th>
                            <th className="px-6 py-3 border-b border-border/40 bg-transparent text-center">
                                {t("common.actions")}
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20 text-sm">
                        {rows.map(({ row, originalIndex }) => {
                            const editing = editingRowIndex === originalIndex;
                            return (
                                <tr
                                    key={`${row.Date}-${row.Asset}-${originalIndex}`}
                                    className="hover:bg-blue-50/30 dark:hover:bg-white/5 transition-all group/row"
                                >
                                    <td className="px-6 py-1.5 text-xs text-slate-500 font-medium tabular-nums align-top">
                                        {editing ? (
                                            renderDateEditor(row, originalIndex)
                                        ) : (
                                            row.Date
                                        )}
                                    </td>
                                    <td className="px-6 py-1.5 text-sm font-medium text-foreground tracking-tight">
                                        {editing ? (
                                            <FieldSelect
                                                value={row.Classification}
                                                options={classifications}
                                                onChange={(v) => onDataChange(originalIndex, "Classification", v)}
                                            />
                                        ) : (
                                            row.Classification
                                        )}
                                    </td>
                                    <td className="px-6 py-1.5 text-sm font-medium text-foreground tracking-tight">
                                        {editing ? (
                                            <FieldSelect
                                                value={row.Institution}
                                                options={institutions}
                                                onChange={(v) => onDataChange(originalIndex, "Institution", v)}
                                            />
                                        ) : (
                                            row.Institution
                                        )}
                                    </td>
                                    <td className="px-6 py-1.5 text-sm font-medium text-foreground tracking-tight">
                                        {editing ? (
                                            <FieldSelect
                                                value={row.ProductType || row.Asset}
                                                options={productTypes}
                                                onChange={(v) => onDataChange(originalIndex, "ProductType", v)}
                                            />
                                        ) : (
                                            row.ProductType || row.Asset
                                        )}
                                    </td>
                                    <td className="px-6 py-1.5 text-sm font-medium text-foreground tracking-tight">
                                        {editing ? (
                                            <FieldSelect
                                                value={row.Asset}
                                                options={assets}
                                                onChange={(v) => onDataChange(originalIndex, "Asset", v)}
                                            />
                                        ) : (
                                            row.Asset
                                        )}
                                    </td>
                                    <td className="px-6 py-1.5 text-sm font-bold text-right tabular-nums">
                                        {editing ? (
                                            <FormattedNumberInput
                                                value={row.Value}
                                                onChange={(n) => onDataChange(originalIndex, "Value", n)}
                                                compactSpinner
                                                className={cellInputClass}
                                            />
                                        ) : (
                                            <span className="text-foreground">{formatCurrency(row.Value)}</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-1.5 text-center">{renderRowActions(originalIndex)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="sm:hidden p-4 space-y-3 max-h-[min(70vh,520px)] overflow-y-auto">
                {rows.map(({ row, originalIndex }) => {
                    const editing = editingRowIndex === originalIndex;
                    return (
                        <div
                            key={`m-${row.Date}-${row.Asset}-${originalIndex}`}
                            className="rounded-xl border border-border bg-slate-50/80 dark:bg-slate-900/40 p-4 space-y-3"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1 space-y-3">
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                                            {t("settings.date")}
                                        </p>
                                        {editing ? (
                                            renderDateEditor(row, originalIndex)
                                        ) : (
                                            <p className="text-sm font-medium text-foreground tabular-nums">{row.Date}</p>
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                                            {t("settings.classification")}
                                        </p>
                                        {editing ? (
                                            <FieldSelect
                                                value={row.Classification}
                                                options={classifications}
                                                onChange={(v) => onDataChange(originalIndex, "Classification", v)}
                                            />
                                        ) : (
                                            <p className="text-sm font-medium text-foreground">{row.Classification}</p>
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                                            {t("portfolio.institution")}
                                        </p>
                                        {editing ? (
                                            <FieldSelect
                                                value={row.Institution}
                                                options={institutions}
                                                onChange={(v) => onDataChange(originalIndex, "Institution", v)}
                                            />
                                        ) : (
                                            <p className="text-sm font-medium text-foreground">{row.Institution}</p>
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                                            {t("settings.productType")}
                                        </p>
                                        {editing ? (
                                            <FieldSelect
                                                value={row.ProductType || row.Asset}
                                                options={productTypes}
                                                onChange={(v) => onDataChange(originalIndex, "ProductType", v)}
                                            />
                                        ) : (
                                            <p className="text-sm font-medium text-foreground">{row.ProductType || row.Asset}</p>
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                                            {t("settings.asset")}
                                        </p>
                                        {editing ? (
                                            <FieldSelect
                                                value={row.Asset}
                                                options={assets}
                                                onChange={(v) => onDataChange(originalIndex, "Asset", v)}
                                            />
                                        ) : (
                                            <p className="text-sm font-medium text-foreground">{row.Asset}</p>
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                                            {t("settings.value")}
                                        </p>
                                        {editing ? (
                                            <FormattedNumberInput
                                                value={row.Value}
                                                onChange={(n) => onDataChange(originalIndex, "Value", n)}
                                                showSpinner={false}
                                                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-bold text-foreground focus:border-primary focus:outline-none"
                                            />
                                        ) : (
                                            <p className="text-lg font-black text-foreground tabular-nums">
                                                {formatCurrency(row.Value)}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <div className="shrink-0">{renderRowActions(originalIndex, true)}</div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
