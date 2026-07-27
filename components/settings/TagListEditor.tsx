"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { EmptyHint } from "./EmptyHint";

type ChipMenuMode = "actions" | "rename" | "merge";

interface TagListEditorProps {
    title: string;
    icon: string;
    items: string[];
    usedItems: string[];
    search: string;
    onSearchChange: (value: string) => void;
    newValue: string;
    onNewValueChange: (value: string) => void;
    onAdd: () => void;
    onRemove: (name: string) => void;
    onRename?: (oldName: string, newName: string) => void;
    onMerge?: (from: string, into: string) => void;
    saving: boolean;
    onSave: () => void;
    emptyHint?: string;
}

const inputClass =
    "rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

export function TagListEditor({
    title, icon, items, usedItems, search, onSearchChange,
    newValue, onNewValueChange, onAdd, onRemove, onRename, onMerge,
    saving, onSave, emptyHint,
}: TagListEditorProps) {
    const { t } = useTranslation();
    const menuRef = useRef<HTMLDivElement>(null);
    const renameRef = useRef<HTMLInputElement>(null);
    const [menuChip, setMenuChip] = useState<string | null>(null);
    const [menuMode, setMenuMode] = useState<ChipMenuMode>("actions");
    const [renameDraft, setRenameDraft] = useState("");
    const [mergeTarget, setMergeTarget] = useState("");

    const closeMenu = () => {
        setMenuChip(null);
        setMenuMode("actions");
        setRenameDraft("");
        setMergeTarget("");
    };

    useEffect(() => {
        if (!menuChip) return;
        const onOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeMenu();
        };
        document.addEventListener("mousedown", onOutside);
        return () => document.removeEventListener("mousedown", onOutside);
    }, [menuChip]);

    useEffect(() => {
        if (menuMode === "rename") renameRef.current?.focus();
    }, [menuMode]);

    const q = search.trim().toLowerCase();
    const filtered = q ? items.filter((i) => i.toLowerCase().includes(q)) : items;
    const mergeOptions = menuChip ? items.filter((i) => i !== menuChip) : [];

    const confirmRename = () => {
        const trimmed = renameDraft.trim();
        if (menuChip && trimmed && trimmed !== menuChip) onRename?.(menuChip, trimmed);
        closeMenu();
    };

    const menuBtn = (label: string, iconName: string, onClick: () => void, danger = false) => (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "w-full text-left px-3 py-2 text-sm font-medium transition-colors flex items-center gap-2",
                danger
                    ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                    : "hover:bg-border"
            )}
        >
            <span className="material-symbols-outlined text-[16px] text-slate-400">{iconName}</span>
            {label}
        </button>
    );

    return (
        <div className="rounded-xl bg-surface border border-border shadow-sm p-6 flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-border pb-4">
                <div className="flex items-center gap-2 text-primary min-w-0">
                    <span className="material-symbols-outlined text-[22px] shrink-0">{icon}</span>
                    <h4 className="text-sm font-bold uppercase tracking-wider truncate">{title}</h4>
                </div>
                <button type="button" onClick={onSave} disabled={saving} className="p-1.5 rounded-lg hover:bg-border text-slate-400 hover:text-primary transition-colors">
                    <span className={cn("material-symbols-outlined text-[18px]", saving && "animate-pulse")}>save</span>
                </button>
            </div>

            <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-400 pointer-events-none">search</span>
                <input value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder={t("settings.searchTags")} className={cn("w-full pl-9", inputClass)} />
            </div>

            <div className="flex gap-2">
                <input value={newValue} onChange={(e) => onNewValueChange(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onAdd()} placeholder={t("settings.addTag")} className={cn("flex-1", inputClass)} />
                <button type="button" onClick={onAdd} className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-bold shrink-0">{t("common.add")}</button>
            </div>

            {filtered.length === 0 ? (
                <EmptyHint title={t("settings.noTags")} description={emptyHint ?? t("settings.noTagsHint")} />
            ) : (
                <div className="flex flex-wrap gap-2 min-h-[40px] relative" ref={menuRef}>
                    {filtered.map((name) => {
                        const inUse = usedItems.includes(name);
                        const open = menuChip === name;
                        return (
                            <div key={name} className="relative">
                                <button
                                    type="button"
                                    onClick={() => (open ? closeMenu() : (setMenuChip(name), setRenameDraft(name), setMenuMode("actions")))}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                                        inUse ? "bg-primary/10 text-primary border-primary/30" : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-border opacity-80 hover:opacity-100"
                                    )}
                                >
                                    {name}
                                    {inUse && <span className="text-[9px] uppercase tracking-wide opacity-70">{t("settings.inUse")}</span>}
                                </button>

                                {open && (
                                    <div className="absolute left-0 top-full mt-1 z-30 w-52 rounded-xl border border-border bg-surface shadow-xl py-1">
                                        {menuMode === "actions" && (
                                            <>
                                                {onRename && menuBtn(t("settings.rename"), "edit", () => setMenuMode("rename"))}
                                                {onMerge && mergeOptions.length > 0 && menuBtn(t("settings.mergeInto"), "merge", () => setMenuMode("merge"))}
                                                {!inUse && menuBtn(t("common.delete"), "delete", () => { onRemove(name); closeMenu(); }, true)}
                                            </>
                                        )}
                                        {menuMode === "rename" && (
                                            <div className="p-2 space-y-2">
                                                <input ref={renameRef} value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") confirmRename(); if (e.key === "Escape") closeMenu(); }} className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm" />
                                                <div className="flex gap-1 justify-end">
                                                    <button type="button" onClick={closeMenu} className="px-2 py-1 text-xs font-bold text-slate-500">{t("common.cancel")}</button>
                                                    <button type="button" onClick={confirmRename} className="px-2 py-1 text-xs font-bold text-primary">{t("common.confirm")}</button>
                                                </div>
                                            </div>
                                        )}
                                        {menuMode === "merge" && (
                                            <div className="p-2 space-y-2">
                                                <select value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)} className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm">
                                                    <option value="">{t("settings.selectTarget")}</option>
                                                    {mergeOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                                                </select>
                                                <div className="flex gap-1 justify-end">
                                                    <button type="button" onClick={closeMenu} className="px-2 py-1 text-xs font-bold text-slate-500">{t("common.cancel")}</button>
                                                    <button type="button" onClick={() => { if (menuChip && mergeTarget) { onMerge?.(menuChip, mergeTarget); closeMenu(); } }} disabled={!mergeTarget} className="px-2 py-1 text-xs font-bold text-primary disabled:opacity-40">{t("settings.merge")}</button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
