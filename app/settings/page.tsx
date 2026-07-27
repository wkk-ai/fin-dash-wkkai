"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useTranslation } from "@/lib/i18n";
import { AssetEntry, Settings, BudgetEntry, MovementEntry } from "@/types/database";
import { parseCustomDate } from "@/lib/utils";
import { savePendingData, loadPendingData as getPendingData, clearPendingData } from "@/lib/pending-storage";
import Portal from "@/components/Portal";
import { ConfirmModal } from "@/components/ConfirmModal";
import { DataReviewModal, ProcessedRow } from "@/components/DataReviewModal";
import { useAuth } from "@/components/AuthProvider";
import { SettingsTabs, SettingsTab } from "@/components/settings/SettingsTabs";
import { SettingsSkeleton } from "@/components/settings/SettingsSkeleton";
import { StickySaveBar } from "@/components/settings/StickySaveBar";
import { TagListEditor } from "@/components/settings/TagListEditor";
import { BudgetsSection } from "@/components/settings/BudgetsSection";
import { DataSection, DataSectionRow } from "@/components/settings/DataSection";
import { ImportExportSection } from "@/components/settings/ImportExportSection";
import { AccountSection } from "@/components/settings/AccountSection";
import { parsePortfolioCsv } from "@/components/new-entry/helpers";
import {
    fetchNetWorth,
    fetchMovements as fetchMovementsData,
    fetchSettings as fetchSettingsData,
    replaceNetWorth,
    replaceMovements as replaceMovementsData,
    replaceBudgets as replaceBudgetsData,
    saveCustomTags,
} from "@/lib/supabase-data";
import Papa from "papaparse";
import * as XLSX from "xlsx";

type TagKind = "classification" | "institution" | "asset" | "income" | "expense";

const SETTINGS_KEY: Record<TagKind, keyof Settings> = {
    classification: "classifications",
    institution: "institutions",
    asset: "assets",
    income: "incomeCategories",
    expense: "expenseCategories",
};

const TAG_SAVE_TYPE: Record<TagKind, string> = {
    classification: "classification",
    institution: "institution",
    asset: "asset",
    income: "income_category",
    expense: "expense_category",
};

const DATA_FIELD: Record<"classification" | "institution" | "asset", keyof AssetEntry> = {
    classification: "Classification",
    institution: "Institution",
    asset: "Asset",
};

function sortData(rows: AssetEntry[]): AssetEntry[] {
    return [...rows].sort((a, b) => {
        const dateA = parseCustomDate(a.Date).getTime();
        const dateB = parseCustomDate(b.Date).getTime();
        if (dateA !== dateB) return dateB - dateA;
        return b.Value - a.Value;
    });
}

function rowSignature(row: AssetEntry): string {
    return `${row.Date}|${row.Classification}|${row.Institution}|${row.Asset}|${row.Value}`;
}

function rowIdentity(row: AssetEntry): string {
    return `${row.Date}|${row.Classification}|${row.Institution}|${row.Asset}`;
}

function computePreviewStats(original: AssetEntry[], current: AssetEntry[]) {
    const origSigs = new Set(original.map(rowSignature));
    const currSigs = new Set(current.map(rowSignature));
    const added = current.filter((r) => !origSigs.has(rowSignature(r))).length;
    const removed = original.filter((r) => !currSigs.has(rowSignature(r))).length;
    let changed = 0;
    current.forEach((r) => {
        const orig = original.find((o) => rowIdentity(o) === rowIdentity(r));
        if (orig && orig.Value !== r.Value) changed++;
    });
    return { added, removed, changed, count: current.length };
}

export default function SettingsPage() {
    const { t } = useTranslation();
    const { user, signOut } = useAuth();

    const [data, setData] = useState<AssetEntry[]>([]);
    const [settings, setSettings] = useState<Settings>({
        classifications: [],
        institutions: [],
        assets: [],
        incomeCategories: [],
        expenseCategories: [],
    });
    const [budgets, setBudgets] = useState<BudgetEntry[]>([]);
    const [movements, setMovements] = useState<MovementEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [hasUserEdited, setHasUserEdited] = useState(false);
    const [activeTab, setActiveTab] = useState<SettingsTab>("tags");
    const [newClassification, setNewClassification] = useState("");
    const [newInstitution, setNewInstitution] = useState("");
    const [newAsset, setNewAsset] = useState("");
    const [newIncomeCategory, setNewIncomeCategory] = useState("");
    const [newExpenseCategory, setNewExpenseCategory] = useState("");
    const [searchClassification, setSearchClassification] = useState("");
    const [searchInstitution, setSearchInstitution] = useState("");
    const [searchAsset, setSearchAsset] = useState("");
    const [searchIncome, setSearchIncome] = useState("");
    const [searchExpense, setSearchExpense] = useState("");
    const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
    const [savingSettings, setSavingSettings] = useState<{ type: string | null }>({ type: null });
    const [importing, setImporting] = useState(false);
    const [importReviewOpen, setImportReviewOpen] = useState(false);
    const [importReviewData, setImportReviewData] = useState<ProcessedRow[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const hasUserEditedRef = useRef(false);
    const originalDataRef = useRef<AssetEntry[]>([]);

    const [sortConfig, setSortConfig] = useState<{ key: keyof AssetEntry; direction: "asc" | "desc" } | null>({
        key: "Date",
        direction: "desc",
    });
    const [selectedClassifications, setSelectedClassifications] = useState<string[]>([]);
    const [selectedInstitutions, setSelectedInstitutions] = useState<string[]>([]);
    const [selectedAssets, setSelectedAssets] = useState<string[]>([]);

    const [modalConfig, setModalConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        confirmLabel: string;
        onConfirm: () => void;
        variant?: "primary" | "danger";
    }>({
        isOpen: false,
        title: "",
        message: "",
        confirmLabel: "",
        onConfirm: () => {},
    });

    const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
    const [exportingPdf, setExportingPdf] = useState(false);
    const [exportDashboard, setExportDashboard] = useState(true);
    const [exportPortfolio, setExportPortfolio] = useState(true);
    const [exportMovements, setExportMovements] = useState(true);

    const [dbClassifications, setDbClassifications] = useState<string[]>([]);
    const [dbInstitutions, setDbInstitutions] = useState<string[]>([]);
    const [dbAssets, setDbAssets] = useState<string[]>([]);
    const [dbIncomeCategories, setDbIncomeCategories] = useState<string[]>([]);
    const [dbExpenseCategories, setDbExpenseCategories] = useState<string[]>([]);

    const markEdited = useCallback(() => {
        hasUserEditedRef.current = true;
        setHasUserEdited(true);
    }, []);

    const markSaved = useCallback(() => {
        hasUserEditedRef.current = false;
        setHasUserEdited(false);
    }, []);

    const toast = useCallback((message: string) => {
        window.dispatchEvent(new CustomEvent("show-success-toast", { detail: { message } }));
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [dbData, settingsData, movementsResult] = await Promise.all([
                fetchNetWorth(),
                fetchSettingsData(),
                fetchMovementsData(),
            ]);

            const sorted = sortData(dbData);
            setData(sorted);
            originalDataRef.current = [...sorted];
            setSettings(settingsData);
            setBudgets(movementsResult.budgets || []);
            setMovements(movementsResult.movements);

            const usedIncome = Array.from(
                new Set(movementsResult.movements.filter((m) => m.Type === "Income").map((m) => m.Category))
            ).filter(Boolean) as string[];
            const usedExpense = Array.from(
                new Set(movementsResult.movements.filter((m) => m.Type === "Expense").map((m) => m.Category))
            ).filter(Boolean) as string[];
            setDbIncomeCategories(usedIncome);
            setDbExpenseCategories(usedExpense);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (data.length > 0) {
            setDbClassifications(Array.from(new Set(data.map((r) => r.Classification))).filter(Boolean));
            setDbInstitutions(Array.from(new Set(data.map((r) => r.Institution))).filter(Boolean));
            setDbAssets(Array.from(new Set(data.map((r) => r.Asset))).filter(Boolean));
        }
    }, [data]);

    useEffect(() => {
        const pending = getPendingData();
        if (pending && pending.length > 0) {
            hasUserEditedRef.current = true;
            setHasUserEdited(true);
            const sorted = sortData(pending);
            setData(sorted);
            setDbClassifications(Array.from(new Set(pending.map((r) => r.Classification))).filter(Boolean) as string[]);
            setDbInstitutions(Array.from(new Set(pending.map((r) => r.Institution))).filter(Boolean) as string[]);
            setDbAssets(Array.from(new Set(pending.map((r) => r.Asset))).filter(Boolean) as string[]);
            fetchSettingsData().then(setSettings).catch(console.error);
            setLoading(false);
        } else {
            markSaved();
            clearPendingData();
            fetchData();
        }

        const handleAdd = (e: Event) => {
            const newRow = (e as CustomEvent).detail as AssetEntry | undefined;
            if (newRow) {
                markEdited();
                setData((prev) => sortData([newRow, ...prev]));
                if (newRow.Classification) setDbClassifications((prev) => Array.from(new Set([...prev, newRow.Classification])));
                if (newRow.Institution) setDbInstitutions((prev) => Array.from(new Set([...prev, newRow.Institution])));
                if (newRow.Asset) setDbAssets((prev) => Array.from(new Set([...prev, newRow.Asset])));
            } else {
                clearPendingData();
                fetchData();
            }
        };

        window.addEventListener("asset-added", handleAdd);
        return () => window.removeEventListener("asset-added", handleAdd);
    }, [markEdited, markSaved]);

    useEffect(() => {
        if (hasUserEditedRef.current && data.length > 0) {
            savePendingData(data);
        }
    }, [data]);

    const dataRows: DataSectionRow[] = useMemo(() => {
        let result = data.map((row, originalIndex) => ({ row, originalIndex }));

        if (selectedClassifications.length > 0) {
            result = result.filter(({ row }) => selectedClassifications.includes(row.Classification));
        }
        if (selectedInstitutions.length > 0) {
            result = result.filter(({ row }) => selectedInstitutions.includes(row.Institution));
        }
        if (selectedAssets.length > 0) {
            result = result.filter(({ row }) => selectedAssets.includes(row.Asset));
        }

        if (sortConfig) {
            result.sort((a, b) => {
                let valA: string | number = a.row[sortConfig.key];
                let valB: string | number = b.row[sortConfig.key];
                if (sortConfig.key === "Date") {
                    valA = parseCustomDate(String(valA)).getTime();
                    valB = parseCustomDate(String(valB)).getTime();
                }
                if (typeof valA === "string") valA = valA.toLowerCase();
                if (typeof valB === "string") valB = valB.toLowerCase();
                if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
                if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
                return 0;
            });
        }

        return result;
    }, [data, selectedClassifications, selectedInstitutions, selectedAssets, sortConfig]);

    const handleSort = (key: keyof AssetEntry) => {
        setSortConfig((prev) => {
            if (prev?.key === key) {
                return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
            }
            return { key, direction: "asc" };
        });
    };

    const saveSettingsSection = async (type: TagKind) => {
        const key = SETTINGS_KEY[type];
        const currentList = settings[key];
        const dbList =
            type === "classification"
                ? dbClassifications
                : type === "institution"
                  ? dbInstitutions
                  : type === "asset"
                    ? dbAssets
                    : type === "income"
                      ? dbIncomeCategories
                      : dbExpenseCategories;

        const missing = dbList.filter((item) => !currentList.includes(item));
        if (missing.length > 0) {
            setModalConfig({
                isOpen: true,
                title: t("settings.cannotSave"),
                message: t("settings.missingInUse", { missing: missing.join(", ") }),
                confirmLabel: t("common.understood"),
                onConfirm: () => setModalConfig((prev) => ({ ...prev, isOpen: false })),
            });
            return;
        }

        setSavingSettings({ type });
        try {
            if (type === "expense") {
                const activeBudgets = budgets.filter((b) => settings.expenseCategories.includes(b.Category));
                await replaceBudgetsData(activeBudgets);
                setBudgets(activeBudgets);
            }

            await Promise.all([
                saveCustomTags("classification", settings.classifications),
                saveCustomTags("institution", settings.institutions),
                saveCustomTags("asset", settings.assets),
                saveCustomTags("income_category", settings.incomeCategories),
                saveCustomTags("expense_category", settings.expenseCategories),
            ]);

            const msgKey =
                type === "institution"
                    ? "settings.institutionsSaved"
                    : type === "asset"
                      ? "settings.assetsSaved"
                      : type === "income"
                        ? "settings.incomeSaved"
                        : type === "expense"
                          ? "settings.expensesSaved"
                          : "settings.classificationsSaved";
            toast(t(msgKey));
        } catch (e) {
            console.error(e);
        } finally {
            setSavingSettings({ type: null });
        }
    };

    const applyTagList = (kind: TagKind, updater: (list: string[]) => string[]) => {
        const key = SETTINGS_KEY[kind];
        setSettings((prev) => ({
            ...prev,
            [key]: updater(prev[key]).sort((a, b) => a.localeCompare(b)),
        }));
    };

    const renameTag = async (kind: TagKind, oldName: string, newName: string) => {
        const trimmed = newName.trim();
        if (!trimmed || trimmed === oldName) return;

        const key = SETTINGS_KEY[kind];
        const newList = Array.from(new Set(settings[key].map((x) => (x === oldName ? trimmed : x)))).sort((a, b) =>
            a.localeCompare(b)
        );
        setSettings((prev) => ({ ...prev, [key]: newList }));

        try {
            if (kind === "classification" || kind === "institution" || kind === "asset") {
                const field = DATA_FIELD[kind];
                const updated = data.map((row) => (row[field] === oldName ? { ...row, [field]: trimmed } : row));
                await replaceNetWorth(updated);
                setData(updated);
                originalDataRef.current = [...updated];
                markSaved();
                clearPendingData();
                if (kind === "classification") {
                    setDbClassifications((prev) => prev.map((x) => (x === oldName ? trimmed : x)));
                } else if (kind === "institution") {
                    setDbInstitutions((prev) => prev.map((x) => (x === oldName ? trimmed : x)));
                } else {
                    setDbAssets((prev) => prev.map((x) => (x === oldName ? trimmed : x)));
                }
            } else {
                const movType = kind === "income" ? "Income" : "Expense";
                const updated = movements.map((m) =>
                    m.Category === oldName && m.Type === movType ? { ...m, Category: trimmed } : m
                );
                await replaceMovementsData(updated);
                setMovements(updated);
                if (kind === "income") {
                    setDbIncomeCategories((prev) => prev.map((x) => (x === oldName ? trimmed : x)));
                } else {
                    setDbExpenseCategories((prev) => prev.map((x) => (x === oldName ? trimmed : x)));
                    const updatedBudgets = budgets.map((b) =>
                        b.Category === oldName ? { ...b, Category: trimmed } : b
                    );
                    setBudgets(updatedBudgets);
                    await replaceBudgetsData(updatedBudgets.filter((b) => newList.includes(b.Category)));
                }
            }

            await saveCustomTags(TAG_SAVE_TYPE[kind], newList);
            toast(t("settings.tagRenamed"));
        } catch (e) {
            console.error(e);
        }
    };

    const executeMergeTag = async (kind: TagKind, from: string, into: string) => {
        if (from === into) return;

        const key = SETTINGS_KEY[kind];
        const newList = settings[key]
            .filter((x) => x !== from)
            .map((x) => (x === from ? into : x));
        const uniqueList = Array.from(new Set(newList)).sort((a, b) => a.localeCompare(b));
        setSettings((prev) => ({ ...prev, [key]: uniqueList }));

        try {
            if (kind === "classification" || kind === "institution" || kind === "asset") {
                const field = DATA_FIELD[kind];
                const updated = data.map((row) => (row[field] === from ? { ...row, [field]: into } : row));
                await replaceNetWorth(updated);
                setData(updated);
                originalDataRef.current = [...updated];
                markSaved();
                clearPendingData();
                if (kind === "classification") {
                    setDbClassifications((prev) => prev.filter((x) => x !== from));
                } else if (kind === "institution") {
                    setDbInstitutions((prev) => prev.filter((x) => x !== from));
                } else {
                    setDbAssets((prev) => prev.filter((x) => x !== from));
                }
            } else {
                const movType = kind === "income" ? "Income" : "Expense";
                const updated = movements.map((m) =>
                    m.Category === from && m.Type === movType ? { ...m, Category: into } : m
                );
                await replaceMovementsData(updated);
                setMovements(updated);
                if (kind === "income") {
                    setDbIncomeCategories((prev) => prev.filter((x) => x !== from));
                } else {
                    setDbExpenseCategories((prev) => prev.filter((x) => x !== from));
                    const fromBudget = budgets.find((b) => b.Category === from);
                    const intoBudget = budgets.find((b) => b.Category === into);
                    const others = budgets.filter((b) => b.Category !== from && b.Category !== into);
                    const merged = [
                        ...others,
                        { Category: into, Budget: (intoBudget?.Budget || 0) + (fromBudget?.Budget || 0) },
                    ];
                    setBudgets(merged);
                    await replaceBudgetsData(merged.filter((b) => uniqueList.includes(b.Category)));
                }
            }

            await saveCustomTags(TAG_SAVE_TYPE[kind], uniqueList);
            toast(t("settings.tagMerged"));
        } catch (e) {
            console.error(e);
        }
    };

    const mergeTag = (kind: TagKind, from: string, into: string) => {
        setModalConfig({
            isOpen: true,
            title: t("settings.merge"),
            message: t("settings.mergeConfirm", { from, into }),
            confirmLabel: t("settings.merge"),
            variant: "danger",
            onConfirm: () => {
                setModalConfig((prev) => ({ ...prev, isOpen: false }));
                void executeMergeTag(kind, from, into);
            },
        });
    };

    const addTag = (kind: TagKind, value: string, clear: () => void) => {
        if (!value) return;
        const key = SETTINGS_KEY[kind];
        if (settings[key].includes(value)) return;
        applyTagList(kind, (list) => [...list, value]);
        clear();
    };

    const removeTag = (kind: TagKind, name: string, inUse: boolean, messageKey: string) => {
        if (inUse) {
            setModalConfig({
                isOpen: true,
                title: t("settings.cannotDelete"),
                message: t(messageKey, { name }),
                confirmLabel: t("common.understood"),
                onConfirm: () => setModalConfig((prev) => ({ ...prev, isOpen: false })),
            });
            return;
        }
        applyTagList(kind, (list) => list.filter((x) => x !== name));
    };

    const handleDataChange = (originalIndex: number, field: keyof AssetEntry, value: string | number) => {
        markEdited();
        setData((prev) => {
            const next = [...prev];
            if (field === "Value") {
                next[originalIndex] = { ...next[originalIndex], Value: Number(value) };
            } else {
                next[originalIndex] = { ...next[originalIndex], [field]: String(value) };
            }
            return next;
        });
    };

    const saveBudgets = async () => {
        setSavingSettings({ type: "budget" });
        try {
            await replaceBudgetsData(budgets);
            toast(t("settings.goalsSaved"));
        } catch (e) {
            console.error(e);
        } finally {
            setSavingSettings({ type: null });
        }
    };

    const executeSave = async () => {
        setSaving(true);
        try {
            await replaceNetWorth(data);
            markSaved();
            clearPendingData();
            originalDataRef.current = [...data];
            window.dispatchEvent(new CustomEvent("pending-saved"));
            toast(t("settings.dbSaved"));
        } catch (e) {
            console.error(e);
            setModalConfig({
                isOpen: true,
                title: t("settings.error"),
                message: t("settings.saveError"),
                confirmLabel: t("common.ok"),
                onConfirm: () => setModalConfig((prev) => ({ ...prev, isOpen: false })),
                variant: "danger",
            });
        } finally {
            setSaving(false);
        }
    };

    const saveDatabase = () => {
        if (!data || data.length === 0) {
            setModalConfig({
                isOpen: true,
                title: t("settings.attention"),
                message: t("settings.emptyDbWarning"),
                confirmLabel: t("common.understood"),
                onConfirm: () => setModalConfig((prev) => ({ ...prev, isOpen: false })),
                variant: "primary",
            });
            return;
        }

        setModalConfig({
            isOpen: true,
            title: t("settings.saveChangesConfirm"),
            message: t("settings.saveConfirmMessage", { count: data.length }),
            confirmLabel: t("common.save"),
            variant: "primary",
            onConfirm: () => {
                setModalConfig((prev) => ({ ...prev, isOpen: false }));
                void executeSave();
            },
        });
    };

    const showPreview = () => {
        const stats = computePreviewStats(originalDataRef.current, data);
        setModalConfig({
            isOpen: true,
            title: t("settings.previewTitle"),
            message: t("settings.previewMessage", stats),
            confirmLabel: t("common.save"),
            variant: "primary",
            onConfirm: () => {
                setModalConfig((prev) => ({ ...prev, isOpen: false }));
                void executeSave();
            },
        });
    };

    const deleteRow = (originalIndex: number) => {
        setModalConfig({
            isOpen: true,
            title: t("settings.deleteRecord"),
            message: t("settings.deleteConfirm"),
            confirmLabel: t("common.delete"),
            variant: "danger",
            onConfirm: () => {
                markEdited();
                setData((prev) => {
                    const next = [...prev];
                    next.splice(originalIndex, 1);
                    return next;
                });
                setModalConfig((prev) => ({ ...prev, isOpen: false }));
            },
        });
    };

    const onCopyEqualSplit = () => {
        const cats = settings.expenseCategories || [];
        if (cats.length === 0) return;
        const total = cats.reduce((acc, c) => acc + (budgets.find((b) => b.Category === c)?.Budget || 0), 0);
        if (total > 0) {
            const each = Math.round(total / cats.length);
            setBudgets(cats.map((c) => ({ Category: c, Budget: each })));
        } else {
            setBudgets(cats.map((c) => ({ Category: c, Budget: 0 })));
        }
    };

    const onClearGoals = () => {
        setBudgets((settings.expenseCategories || []).map((c) => ({ Category: c, Budget: 0 })));
    };

    const parseImportRows = async (file: File): Promise<AssetEntry[]> => {
        const ext = file.name.split(".").pop()?.toLowerCase() || "";
        if (ext === "json") {
            const text = await file.text();
            const parsed = JSON.parse(text) as { netWorth?: AssetEntry[] };
            if (parsed.netWorth && Array.isArray(parsed.netWorth)) {
                return parsed.netWorth;
            }
            const result = parsePortfolioCsv(text);
            if (!result.ok) throw new Error(result.error);
            return result.rows;
        }
        if (ext === "csv") {
            const result = parsePortfolioCsv(await file.text());
            if (!result.ok) throw new Error(result.error);
            return result.rows;
        }
        if (ext === "xlsx" || ext === "xls") {
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf, { type: "array" });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const csv = XLSX.utils.sheet_to_csv(sheet);
            const result = parsePortfolioCsv(csv);
            if (!result.ok) throw new Error(result.error);
            return result.rows;
        }
        throw new Error(t("settings.importErrorUnsupportedType"));
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;

        setImporting(true);
        try {
            const rows = await parseImportRows(file);
            setImportReviewData(
                rows.map((r, i) => ({
                    id: `import-${i}-${Math.random().toString(36).slice(2, 6)}`,
                    Date: r.Date,
                    Description: "",
                    Category: "",
                    Classification: r.Classification,
                    Asset: r.Asset,
                    Value: r.Value,
                }))
            );
            setImportReviewOpen(true);
        } catch (err) {
            console.error(err);
            setModalConfig({
                isOpen: true,
                title: t("settings.error"),
                message: err instanceof Error ? err.message : t("settings.importError"),
                confirmLabel: t("common.ok"),
                onConfirm: () => setModalConfig((prev) => ({ ...prev, isOpen: false })),
                variant: "danger",
            });
        } finally {
            setImporting(false);
        }
    };

    const handleConfirmImport = async (processedRows: ProcessedRow[], mode: "append" | "overwrite") => {
        setImporting(true);
        try {
            const entries: AssetEntry[] = processedRows.map((r) => ({
                Date: r.Date,
                Classification: r.Classification || "",
                Institution: (r as ProcessedRow & { Institution?: string }).Institution || "",
                Asset: r.Asset || "",
                Value: r.Value,
            }));
            const next = mode === "append" ? sortData([...data, ...entries]) : sortData(entries);
            await replaceNetWorth(next);
            setData(next);
            originalDataRef.current = [...next];
            markSaved();
            clearPendingData();
            setImportReviewOpen(false);
            toast(t("settings.importSuccess"));
        } catch (err) {
            console.error(err);
            setModalConfig({
                isOpen: true,
                title: t("settings.error"),
                message: t("settings.importError"),
                confirmLabel: t("common.ok"),
                onConfirm: () => setModalConfig((prev) => ({ ...prev, isOpen: false })),
                variant: "danger",
            });
        } finally {
            setImporting(false);
        }
    };

    const onBackupJson = async () => {
        try {
            let movs = movements;
            let buds = budgets;
            if (movs.length === 0) {
                const result = await fetchMovementsData();
                movs = result.movements;
                buds = result.budgets;
            }
            const payload = {
                exportedAt: new Date().toISOString(),
                netWorth: data,
                movements: movs,
                budgets: buds,
                settings,
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `fintrack-backup-${new Date().toISOString().slice(0, 10)}.json`;
            link.click();
            URL.revokeObjectURL(link.href);
            toast(t("settings.backupDone"));
        } catch (e) {
            console.error(e);
        }
    };

    const downloadFile = (format: "csv" | "xlsx") => {
        if (dataRows.length === 0) return;
        const exportData = dataRows.map(({ row }) => ({
            Date: row.Date,
            Classification: row.Classification,
            Institution: row.Institution,
            Asset: row.Asset,
            Value: row.Value,
        }));
        const filename = `fintrack-data-${new Date().toISOString().slice(0, 10)}`;
        if (format === "csv") {
            const csv = Papa.unparse(exportData);
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `${filename}.csv`;
            link.click();
            URL.revokeObjectURL(link.href);
        } else {
            const worksheet = XLSX.utils.json_to_sheet(exportData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
            XLSX.writeFile(workbook, `${filename}.xlsx`);
        }
    };

    const captureRouteAsImage = async (route: string) => {
        const { toPng } = await import("html-to-image");
        return await new Promise<{ imgData: string; width: number; height: number }>((resolve, reject) => {
            const iframe = document.createElement("iframe");
            iframe.src = route;
            iframe.style.position = "fixed";
            iframe.style.left = "-99999px";
            iframe.style.top = "0";
            iframe.style.width = "1440px";
            iframe.style.height = "2400px";
            iframe.style.opacity = "0";
            iframe.style.pointerEvents = "none";

            const cleanUp = () => {
                if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
            };

            iframe.onload = async () => {
                try {
                    const doc = iframe.contentDocument;
                    if (!doc) throw new Error("Failed to access iframe document");
                    await new Promise((r) => setTimeout(r, 1200));

                    const currentOrigin = window.location.origin;
                    Array.from(doc.querySelectorAll('link[rel="stylesheet"]')).forEach((linkEl) => {
                        const href = (linkEl as HTMLLinkElement).href || "";
                        if (!href) return;
                        let isCrossOrigin = false;
                        try {
                            const parsed = new URL(href, currentOrigin);
                            isCrossOrigin = parsed.origin !== currentOrigin;
                        } catch {
                            isCrossOrigin = false;
                        }
                        if (isCrossOrigin) linkEl.remove();
                    });

                    const fonts = (doc as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
                    if (fonts?.ready) await fonts.ready;

                    doc.querySelectorAll(".material-symbols-outlined").forEach((el) => {
                        const iconEl = el as HTMLElement;
                        iconEl.textContent = "";
                        iconEl.style.fontSize = "0";
                        iconEl.style.lineHeight = "0";
                    });

                    const target = doc.body as HTMLElement;
                    const width = Math.max(doc.documentElement.scrollWidth, doc.body.scrollWidth, 1440);
                    const height = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight, 1200);
                    const pageBg = doc.defaultView
                        ? doc.defaultView.getComputedStyle(doc.body).backgroundColor
                        : "#ffffff";

                    const imgData = await toPng(target, {
                        cacheBust: true,
                        pixelRatio: 2,
                        backgroundColor: pageBg,
                        width,
                        height,
                    });
                    resolve({ imgData, width, height });
                } catch (err) {
                    reject(err);
                } finally {
                    cleanUp();
                }
            };

            iframe.onerror = () => {
                cleanUp();
                reject(new Error(`Failed loading route: ${route}`));
            };

            document.body.appendChild(iframe);
        });
    };

    const exportSelectedTabsAsPdf = async () => {
        const selectedRoutes: string[] = [];
        if (exportDashboard) selectedRoutes.push("/");
        if (exportPortfolio) selectedRoutes.push("/portfolio");
        if (exportMovements) selectedRoutes.push("/movements");
        if (!selectedRoutes.length) return;

        setExportingPdf(true);
        try {
            const { jsPDF } = await import("jspdf");
            const pdf = new jsPDF("p", "pt", "a4");
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const margin = 24;
            const printableWidth = pageWidth - margin * 2;
            const printableHeight = pageHeight - margin * 2;

            for (let i = 0; i < selectedRoutes.length; i++) {
                const capture = await captureRouteAsImage(selectedRoutes[i]);
                if (i > 0) pdf.addPage();
                const ratio = Math.min(printableWidth / capture.width, printableHeight / capture.height);
                const renderWidth = capture.width * ratio;
                const renderHeight = capture.height * ratio;
                const x = (pageWidth - renderWidth) / 2;
                pdf.addImage(capture.imgData, "PNG", x, margin, renderWidth, renderHeight);
            }

            pdf.save(`fintrack-export-${new Date().toISOString().slice(0, 10)}.pdf`);
            setIsExportDialogOpen(false);
        } catch (e) {
            console.error(e);
            setModalConfig({
                isOpen: true,
                title: t("settings.error"),
                message: t("settings.exportPdfError"),
                confirmLabel: t("common.ok"),
                onConfirm: () => setModalConfig((prev) => ({ ...prev, isOpen: false })),
                variant: "danger",
            });
        } finally {
            setExportingPdf(false);
        }
    };

    if (loading) {
        return <SettingsSkeleton />;
    }

    return (
        <div className="w-full flex flex-col gap-8 pb-20">
            <div className="animate-in slide-in-from-bottom-2 fade-in duration-500">
                <h1 className="text-3xl font-bold text-foreground">{t("settings.title")}</h1>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-300 mt-1">{t("settings.subtitle")}</p>
            </div>

            <SettingsTabs active={activeTab} onChange={setActiveTab} />

            {activeTab === "tags" && (
                <div className="flex flex-col gap-6 animate-in fade-in duration-300">
                    <TagListEditor
                        title={t("settings.classifications")}
                        icon="category"
                        items={settings.classifications}
                        usedItems={dbClassifications}
                        search={searchClassification}
                        onSearchChange={setSearchClassification}
                        newValue={newClassification}
                        onNewValueChange={setNewClassification}
                        onAdd={() => addTag("classification", newClassification, () => setNewClassification(""))}
                        onRemove={(name) => removeTag("classification", name, dbClassifications.includes(name), "settings.classInUse")}
                        onRename={(oldName, newName) => void renameTag("classification", oldName, newName)}
                        onMerge={(from, into) => mergeTag("classification", from, into)}
                        saving={savingSettings.type === "classification"}
                        onSave={() => void saveSettingsSection("classification")}
                        emptyHint={t("settings.classPlaceholder")}
                    />
                    <TagListEditor
                        title={t("settings.institutions")}
                        icon="account_balance"
                        items={settings.institutions}
                        usedItems={dbInstitutions}
                        search={searchInstitution}
                        onSearchChange={setSearchInstitution}
                        newValue={newInstitution}
                        onNewValueChange={setNewInstitution}
                        onAdd={() => addTag("institution", newInstitution, () => setNewInstitution(""))}
                        onRemove={(name) => removeTag("institution", name, dbInstitutions.includes(name), "settings.institutionInUse")}
                        onRename={(oldName, newName) => void renameTag("institution", oldName, newName)}
                        onMerge={(from, into) => mergeTag("institution", from, into)}
                        saving={savingSettings.type === "institution"}
                        onSave={() => void saveSettingsSection("institution")}
                        emptyHint={t("settings.institutionPlaceholder")}
                    />
                    <TagListEditor
                        title={t("settings.assetNameLabel")}
                        icon="savings"
                        items={settings.assets}
                        usedItems={dbAssets}
                        search={searchAsset}
                        onSearchChange={setSearchAsset}
                        newValue={newAsset}
                        onNewValueChange={setNewAsset}
                        onAdd={() => addTag("asset", newAsset, () => setNewAsset(""))}
                        onRemove={(name) => removeTag("asset", name, dbAssets.includes(name), "settings.assetInUse")}
                        onRename={(oldName, newName) => void renameTag("asset", oldName, newName)}
                        onMerge={(from, into) => mergeTag("asset", from, into)}
                        saving={savingSettings.type === "asset"}
                        onSave={() => void saveSettingsSection("asset")}
                        emptyHint={t("settings.assetNamePlaceholder")}
                    />
                    <TagListEditor
                        title={t("settings.incomeCategories")}
                        icon="trending_up"
                        items={settings.incomeCategories}
                        usedItems={dbIncomeCategories}
                        search={searchIncome}
                        onSearchChange={setSearchIncome}
                        newValue={newIncomeCategory}
                        onNewValueChange={setNewIncomeCategory}
                        onAdd={() => addTag("income", newIncomeCategory, () => setNewIncomeCategory(""))}
                        onRemove={(name) => removeTag("income", name, dbIncomeCategories.includes(name), "settings.categoryInUse")}
                        onRename={(oldName, newName) => void renameTag("income", oldName, newName)}
                        onMerge={(from, into) => mergeTag("income", from, into)}
                        saving={savingSettings.type === "income"}
                        onSave={() => void saveSettingsSection("income")}
                    />
                    <TagListEditor
                        title={t("settings.expenseCategories")}
                        icon="trending_down"
                        items={settings.expenseCategories}
                        usedItems={dbExpenseCategories}
                        search={searchExpense}
                        onSearchChange={setSearchExpense}
                        newValue={newExpenseCategory}
                        onNewValueChange={setNewExpenseCategory}
                        onAdd={() => addTag("expense", newExpenseCategory, () => setNewExpenseCategory(""))}
                        onRemove={(name) => removeTag("expense", name, dbExpenseCategories.includes(name), "settings.categoryInUse")}
                        onRename={(oldName, newName) => void renameTag("expense", oldName, newName)}
                        onMerge={(from, into) => mergeTag("expense", from, into)}
                        saving={savingSettings.type === "expense"}
                        onSave={() => void saveSettingsSection("expense")}
                    />
                </div>
            )}

            {activeTab === "budgets" && (
                <BudgetsSection
                    expenseCategories={settings.expenseCategories}
                    budgets={budgets}
                    onBudgetsChange={setBudgets}
                    saving={savingSettings.type === "budget"}
                    onSave={() => void saveBudgets()}
                    onCopyEqualSplit={onCopyEqualSplit}
                    onClearGoals={onClearGoals}
                    onEnsureCategories={() => setActiveTab("tags")}
                />
            )}

            {activeTab === "data" && (
                <DataSection
                    data={data}
                    rows={dataRows}
                    classifications={settings.classifications}
                    institutions={settings.institutions}
                    assets={settings.assets}
                    editingRowIndex={editingRowIndex}
                    onEditingRowIndexChange={setEditingRowIndex}
                    onDataChange={handleDataChange}
                    sortConfig={sortConfig}
                    onSort={handleSort}
                    selectedClassifications={selectedClassifications}
                    selectedInstitutions={selectedInstitutions}
                    selectedAssets={selectedAssets}
                    onToggleClassificationFilter={(v) =>
                        setSelectedClassifications((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]))
                    }
                    onToggleInstitutionFilter={(v) =>
                        setSelectedInstitutions((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]))
                    }
                    onToggleAssetFilter={(v) =>
                        setSelectedAssets((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]))
                    }
                    onClearClassificationFilters={() => setSelectedClassifications([])}
                    onClearInstitutionFilters={() => setSelectedInstitutions([])}
                    onClearAssetFilters={() => setSelectedAssets([])}
                    onDeleteRow={deleteRow}
                    onPreview={showPreview}
                    previewLabel={t("settings.previewChanges")}
                />
            )}

            {activeTab === "import" && (
                <ImportExportSection
                    onBackupJson={() => void onBackupJson()}
                    onDownloadCsv={() => downloadFile("csv")}
                    onDownloadXlsx={() => downloadFile("xlsx")}
                    onExportPdf={() => setIsExportDialogOpen(true)}
                    exportingPdf={exportingPdf}
                    onImportClick={() => fileInputRef.current?.click()}
                    importing={importing}
                    fileInputRef={fileInputRef}
                    onFileChange={(e) => void handleFileChange(e)}
                />
            )}

            {activeTab === "account" && <AccountSection email={user?.email ?? null} onSignOut={() => void signOut()} />}

            <StickySaveBar
                visible={hasUserEdited}
                message={t("settings.unsavedChanges")}
                saveLabel={saving ? t("settings.saving") : t("settings.saveChanges")}
                saving={saving}
                onSave={saveDatabase}
                previewLabel={t("settings.previewChanges")}
                onPreview={showPreview}
            />

            {isExportDialogOpen && (
                <Portal>
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div
                            className="absolute inset-0 bg-background/60 backdrop-blur-sm"
                            onClick={() => !exportingPdf && setIsExportDialogOpen(false)}
                        />
                        <div className="relative w-full max-w-md rounded-2xl bg-surface border border-border shadow-2xl p-6">
                            <h3 className="text-xl font-bold text-foreground mb-2">{t("settings.exportPdf")}</h3>
                            <p className="text-sm text-slate-700 dark:text-slate-300 mb-4">{t("settings.selectTabsToExport")}</p>
                            <div className="space-y-3 mb-6">
                                <label className="flex items-center gap-3 text-sm text-foreground">
                                    <input
                                        type="checkbox"
                                        checked={exportDashboard}
                                        onChange={(e) => setExportDashboard(e.target.checked)}
                                        className="h-4 w-4 accent-primary"
                                    />
                                    {t("settings.exportDashboard")}
                                </label>
                                <label className="flex items-center gap-3 text-sm text-foreground">
                                    <input
                                        type="checkbox"
                                        checked={exportPortfolio}
                                        onChange={(e) => setExportPortfolio(e.target.checked)}
                                        className="h-4 w-4 accent-primary"
                                    />
                                    {t("settings.exportPortfolio")}
                                </label>
                                <label className="flex items-center gap-3 text-sm text-foreground">
                                    <input
                                        type="checkbox"
                                        checked={exportMovements}
                                        onChange={(e) => setExportMovements(e.target.checked)}
                                        className="h-4 w-4 accent-primary"
                                    />
                                    {t("settings.exportMovements")}
                                </label>
                            </div>
                            <div className="flex gap-3 justify-end">
                                <button
                                    type="button"
                                    onClick={() => setIsExportDialogOpen(false)}
                                    disabled={exportingPdf}
                                    className="px-4 py-2 rounded-lg text-sm font-bold text-foreground hover:bg-border transition-colors cursor-pointer disabled:opacity-50"
                                >
                                    {t("common.cancel")}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void exportSelectedTabsAsPdf()}
                                    disabled={exportingPdf || (!exportDashboard && !exportPortfolio && !exportMovements)}
                                    className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-primary hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-50"
                                >
                                    {exportingPdf ? t("settings.exportingPdf") : t("settings.confirmExportPdf")}
                                </button>
                            </div>
                        </div>
                    </div>
                </Portal>
            )}

            {importReviewOpen && (
                <DataReviewModal
                    type="patrimonio"
                    initialData={importReviewData}
                    onClose={() => setImportReviewOpen(false)}
                    onImport={(rows, mode) => handleConfirmImport(rows, mode)}
                    isImporting={importing}
                />
            )}

            <ConfirmModal
                isOpen={modalConfig.isOpen}
                title={modalConfig.title}
                message={modalConfig.message}
                confirmLabel={modalConfig.confirmLabel}
                variant={modalConfig.variant}
                onConfirm={modalConfig.onConfirm}
                onCancel={() => setModalConfig((prev) => ({ ...prev, isOpen: false }))}
            />
        </div>
    );
}
