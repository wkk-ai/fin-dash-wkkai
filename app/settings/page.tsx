"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslation } from "@/lib/i18n";
import { AssetEntry, Classification, Asset, Settings, BudgetEntry } from "@/types/database";
import { cn } from "@/lib/utils";
import { savePendingData, loadPendingData as getPendingData, clearPendingData } from "@/lib/pending-storage";
import Portal from "@/components/Portal";
import { ConfirmModal } from "@/components/ConfirmModal";
import { FormattedNumberInput } from "@/components/FormattedNumberInput";
import Papa from "papaparse";
import * as XLSX from "xlsx";

export default function SettingsPage() {
    const { t } = useTranslation();
    const [data, setData] = useState<AssetEntry[]>([]);
    const [settings, setSettings] = useState<Settings>({
        classifications: [],
        assets: [],
        incomeCategories: [],
        expenseCategories: []
    });
    const [budgets, setBudgets] = useState<BudgetEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [importingFile, setImportingFile] = useState(false);
    const [newClassification, setNewClassification] = useState("");
    const [newAsset, setNewAsset] = useState("");
    const [newIncomeCategory, setNewIncomeCategory] = useState("");
    const [newExpenseCategory, setNewExpenseCategory] = useState("");
    const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
    const [savingSettings, setSavingSettings] = useState<{ type: string | null }>({ type: null });
    const [isDownloadOpen, setIsDownloadOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const hasUserEditedRef = useRef(false);

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
        onConfirm: () => { },
    });

    const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
    const [exportingPdf, setExportingPdf] = useState(false);
    const [exportDashboard, setExportDashboard] = useState(true);
    const [exportPortfolio, setExportPortfolio] = useState(true);
    const [exportMovements, setExportMovements] = useState(true);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
        }).format(value);
    };

    const parseCustomDate = (dateStr: string) => {
        const [day, month, year] = dateStr.split("/").map(Number);
        return new Date(year, month - 1, day);
    };

    const csvDateToInputDate = (csvDate: string) => {
        if (!csvDate) return "";
        const parts = csvDate.split("/");
        if (parts.length !== 3) return csvDate;
        return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
    };

    const inputDateToCsvDate = (inputDate: string) => {
        if (!inputDate) return "";
        const parts = inputDate.split("-");
        if (parts.length !== 3) return inputDate;
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const [dbRes, settingsRes, movementsRes] = await Promise.all([
                fetch("/api/database"),
                fetch("/api/settings"),
                fetch("/api/movements")
            ]);

            const dbData = await dbRes.json();
            const settingsData = await settingsRes.json();
            const movementsData = await movementsRes.json();

            setData(dbData);
            setSettings(settingsData);
            setBudgets(movementsData.budgets || []);

        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    // Derived lists from database to prevent deleting tags actually in use
    const [dbClassifications, setDbClassifications] = useState<string[]>([]);
    const [dbAssets, setDbAssets] = useState<string[]>([]);
    const [dbIncomeCategories, setDbIncomeCategories] = useState<string[]>([]);
    const [dbExpenseCategories, setDbExpenseCategories] = useState<string[]>([]);

    useEffect(() => {
        if (data.length > 0) {
            const usedClasses = Array.from(new Set(data.map(r => r.Classification))).filter(Boolean);
            const usedAssets = Array.from(new Set(data.map(r => r.Asset))).filter(Boolean);
            setDbClassifications(usedClasses);
            setDbAssets(usedAssets);
        }
    }, [data]);

    useEffect(() => {
        const pending = getPendingData();
        if (pending && pending.length > 0) {
            // Restore unsaved changes from previous session (e.g. after switching tabs)
            hasUserEditedRef.current = true;
            const sorted = [...pending].sort((a, b) => {
                const dateA = parseCustomDate(a.Date).getTime();
                const dateB = parseCustomDate(b.Date).getTime();
                if (dateA !== dateB) return dateB - dateA;
                return b.Value - a.Value;
            });
            setData(sorted);
            const usedClasses = Array.from(new Set(pending.map((r: AssetEntry) => r.Classification))).filter(Boolean) as string[];
            const usedAssets = Array.from(new Set(pending.map((r: AssetEntry) => r.Asset))).filter(Boolean) as string[];
            setDbClassifications(usedClasses);
            setDbAssets(usedAssets);
            // Still need settings (classifications, assets) from API
            fetch("/api/settings")
                .then(res => res.json())
                .then(setSettings)
                .catch(console.error);
            setLoading(false);
        } else {
            hasUserEditedRef.current = false;
            clearPendingData();
            fetchData();
        }

        // Handle updates from AddAssetModal non-destructively
        const handleAdd = (e: any) => {
            const newRow = e.detail;
            if (newRow) {
                hasUserEditedRef.current = true;
                setData(prevData => {
                    const updated = [newRow, ...prevData];
                    return updated.sort((a, b) => {
                        const dateA = parseCustomDate(a.Date).getTime();
                        const dateB = parseCustomDate(b.Date).getTime();
                        if (dateA !== dateB) return dateB - dateA;
                        return b.Value - a.Value;
                    });
                });
                if (newRow.Classification) setDbClassifications(prev => Array.from(new Set([...prev, newRow.Classification])));
                if (newRow.Asset) setDbAssets(prev => Array.from(new Set([...prev, newRow.Asset])));
            } else {
                clearPendingData();
                fetchData();
            }
        };

        window.addEventListener("asset-added", handleAdd);
        return () => window.removeEventListener("asset-added", handleAdd);
    }, []);

    // Persist data to sessionStorage ONLY when user has explicitly edited (delete, edit, add)
    useEffect(() => {
        if (hasUserEditedRef.current && data.length > 0) {
            savePendingData(data);
        }
    }, [data]);

    const saveSettingsSection = async (type: "class" | "asset" | "income" | "expense") => {
        const isClass = type === "class";
        const isAsset = type === "asset";
        const isIncome = type === "income";
        const currentList = isClass ? settings.classifications : isAsset ? settings.assets : isIncome ? settings.incomeCategories : settings.expenseCategories;
        const dbList = isClass ? dbClassifications : isAsset ? dbAssets : isIncome ? dbIncomeCategories : dbExpenseCategories;

        // Safety check: is any item from DB missing in current list?
        const missing = dbList.filter(item => !currentList.includes(item));

        if (missing.length > 0) {
            setModalConfig({
                isOpen: true,
                title: t("settings.cannotSave"),
                message: t("settings.missingInUse", { missing: missing.join(", ") }),
                confirmLabel: t("common.understood"),
                onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
            });
            return;
        }

        setSavingSettings({ type });
        try {
            await fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(settings),
            });
            let msgKey = "settings.classificationsSaved";
            if (isAsset) msgKey = "settings.assetsSaved";
            if (isIncome) msgKey = "settings.incomeSaved";
            if (type === "expense") msgKey = "settings.expensesSaved";

            window.dispatchEvent(
                new CustomEvent("show-success-toast", {
                    detail: { message: t(msgKey) }
                })
            );
        } catch (e) {
            console.error(e);
        } finally {
            setSavingSettings({ type: null });
        }
    };

    const addClassification = () => {
        if (!newClassification) return;
        if (settings.classifications.includes(newClassification)) return;
        setSettings(prev => ({
            ...prev,
            classifications: [...prev.classifications, newClassification].sort((a, b) => a.localeCompare(b))
        }));
        setNewClassification("");
    };

    const removeClassification = (c: string) => {
        if (dbClassifications.includes(c)) {
            setModalConfig({
                isOpen: true,
                title: t("settings.cannotDelete"),
                message: t("settings.classInUse", { name: c }),
                confirmLabel: t("common.understood"),
                onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
            });
            return;
        }
        setSettings(prev => ({ ...prev, classifications: prev.classifications.filter(x => x !== c) }));
    };

    const addAsset = () => {
        if (!newAsset) return;
        if (settings.assets.includes(newAsset)) return;
        setSettings(prev => ({
            ...prev,
            assets: [...prev.assets, newAsset].sort((a, b) => a.localeCompare(b))
        }));
        setNewAsset("");
    };

    const removeAsset = (a: string) => {
        if (dbAssets.includes(a)) {
            setModalConfig({
                isOpen: true,
                title: t("settings.cannotDelete"),
                message: t("settings.assetInUse", { name: a }),
                confirmLabel: t("common.understood"),
                onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
            });
            return;
        }
        setSettings(prev => ({ ...prev, assets: prev.assets.filter(x => x !== a) }));
    };

    const addIncomeCategory = () => {
        if (!newIncomeCategory) return;
        if (settings.incomeCategories.includes(newIncomeCategory)) return;
        setSettings(prev => ({
            ...prev,
            incomeCategories: [...prev.incomeCategories, newIncomeCategory].sort((a, b) => a.localeCompare(b))
        }));
        setNewIncomeCategory("");
    };

    const removeIncomeCategory = (c: string) => {
        if (dbIncomeCategories.includes(c)) {
            setModalConfig({
                isOpen: true,
                title: t("settings.cannotDelete"),
                message: t("settings.categoryInUse", { name: c }),
                confirmLabel: t("common.understood"),
                onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
            });
            return;
        }
        setSettings(prev => ({ ...prev, incomeCategories: prev.incomeCategories.filter(x => x !== c) }));
    };

    const addExpenseCategory = () => {
        if (!newExpenseCategory) return;
        if (settings.expenseCategories.includes(newExpenseCategory)) return;
        setSettings(prev => ({
            ...prev,
            expenseCategories: [...prev.expenseCategories, newExpenseCategory].sort((a, b) => a.localeCompare(b))
        }));
        setNewExpenseCategory("");
    };

    const removeExpenseCategory = (c: string) => {
        if (dbExpenseCategories.includes(c)) {
            setModalConfig({
                isOpen: true,
                title: t("settings.cannotDelete"),
                message: t("settings.categoryInUse", { name: c }),
                confirmLabel: t("common.understood"),
                onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
            });
            return;
        }
        setSettings(prev => ({ ...prev, expenseCategories: prev.expenseCategories.filter(x => x !== c) }));
    };

    const handleDataChange = (index: number, field: keyof AssetEntry, value: string) => {
        hasUserEditedRef.current = true;
        const newData = [...data];
        if (field === "Value") {
            newData[index][field] = Number(value);
        } else {
            newData[index][field] = value as any;
        }
        setData(newData);
    };

    const saveBudgets = async () => {
        setSavingSettings({ type: "budget" });
        try {
            await fetch("/api/movements", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "updateBudgets", data: budgets }),
            });
            window.dispatchEvent(
                new CustomEvent("show-success-toast", {
                    detail: { message: t("settings.goalsSaved") }
                })
            );
        } catch (e) {
            console.error(e);
        } finally {
            setSavingSettings({ type: null });
        }
    };

    const saveDatabase = async () => {
        if (!data || data.length === 0) {
            setModalConfig({
                isOpen: true,
                title: t("settings.attention"),
                message: t("settings.emptyDbWarning"),
                confirmLabel: t("common.understood"),
                onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
                variant: "primary"
            });
            return;
        }

        setModalConfig({
            isOpen: true,
            title: t("settings.saveChangesConfirm"),
            message: t("settings.saveConfirmMessage", { count: data.length }),
            confirmLabel: t("common.save"),
            variant: "primary",
            onConfirm: async () => {
                setModalConfig(prev => ({ ...prev, isOpen: false }));
                setSaving(true);
                try {
                    await fetch("/api/database", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "updateAll", data }),
                    });
                    hasUserEditedRef.current = false;
                    clearPendingData();
                    window.dispatchEvent(new CustomEvent("pending-saved"));
                    window.dispatchEvent(
                        new CustomEvent("show-success-toast", {
                            detail: { message: t("settings.dbSaved") }
                        })
                    );
                } catch (e) {
                    console.error(e);
                    setModalConfig({
                        isOpen: true,
                        title: t("settings.error"),
                        message: t("settings.saveError"),
                        confirmLabel: t("common.ok"),
                        onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
                        variant: "danger"
                    });
                } finally {
                    setSaving(false);
                }
            }
        });
    };

    const deleteRow = (e: React.MouseEvent, index: number) => {
        e.preventDefault();
        e.stopPropagation();

        setModalConfig({
            isOpen: true,
            title: t("settings.deleteRecord"),
            message: t("settings.deleteConfirm"),
            confirmLabel: t("common.delete"),
            variant: "danger",
            onConfirm: () => {
                hasUserEditedRef.current = true;
                const newData = [...data];
                newData.splice(index, 1);
                setData(newData);
                setModalConfig(prev => ({ ...prev, isOpen: false }));
            }
        });
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

                    // Prevent cross-origin stylesheet access errors during DOM-to-image conversion,
                    // while keeping app styles loaded from the same origin.
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
                        if (isCrossOrigin) {
                            linkEl.remove();
                        }
                    });

                    const fonts = (doc as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
                    if (fonts?.ready) await fonts.ready;

                    // If icon font ligatures are unavailable in the iframe snapshot,
                    // hide ligature text tokens (e.g. "grid_view", "trending_up").
                    doc.querySelectorAll(".material-symbols-outlined").forEach((el) => {
                        const iconEl = el as HTMLElement;
                        iconEl.textContent = "";
                        iconEl.style.fontSize = "0";
                        iconEl.style.lineHeight = "0";
                    });

                    const target = doc.body as HTMLElement;
                    const width = Math.max(
                        doc.documentElement.scrollWidth,
                        doc.body.scrollWidth,
                        1440
                    );
                    const height = Math.max(
                        doc.documentElement.scrollHeight,
                        doc.body.scrollHeight,
                        1200
                    );
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
                const y = margin;

                pdf.addImage(capture.imgData, "PNG", x, y, renderWidth, renderHeight);
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
                onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
                variant: "danger"
            });
        } finally {
            setExportingPdf(false);
        }
    };

    const importDatabaseFile = async (file: File) => {
        setImportingFile(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            const res = await fetch("/api/database", {
                method: "POST",
                body: formData,
            });
            const payload = await res.json();
            if (!res.ok) {
                let message: string;
                if (payload.errorCode === "COLUMN_COUNT") {
                    message = t("settings.importErrorColumnCount", { expected: payload.expected, received: payload.received });
                } else if (payload.errorCode === "COLUMN_NAMES") {
                    message = t("settings.importErrorColumnNames", { expected: payload.expected, received: payload.received });
                } else if (payload.errorCode === "CSV_FORMAT") {
                    message = t("settings.importErrorCsvFormat");
                } else if (payload.errorCode === "UNSUPPORTED_FILE_TYPE") {
                    message = t("settings.importErrorUnsupportedType");
                } else if (payload.errorCode === "NO_FILE") {
                    message = t("settings.importErrorNoFile");
                } else {
                    message = payload.error || t("settings.importError");
                }
                setModalConfig({
                    isOpen: true,
                    title: t("settings.error"),
                    message,
                    confirmLabel: t("common.ok"),
                    onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
                    variant: "danger"
                });
                return;
            }

            hasUserEditedRef.current = false;
            clearPendingData();
            fetchData();
            window.dispatchEvent(
                new CustomEvent("show-success-toast", {
                    detail: { message: t("settings.importSuccess") }
                })
            );
        } catch (e) {
            console.error(e);
            setModalConfig({
                isOpen: true,
                title: t("settings.error"),
                message: t("settings.importError"),
                confirmLabel: t("common.ok"),
                onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
                variant: "danger"
            });
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = "";
            setImportingFile(false);
        }
    };

    const downloadFile = (format: "csv" | "xlsx") => {
        if (!data || data.length === 0) return;

        // Prepare data for export
        const exportData = data.map(row => ({
            Date: row.Date,
            Classification: row.Classification,
            Asset: row.Asset,
            Value: row.Value
        }));

        const filename = `fintrack-data-${new Date().toISOString().slice(0, 10)}`;

        if (format === "csv") {
            const csv = Papa.unparse(exportData);
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", `${filename}.csv`);
            link.style.visibility = "hidden";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else {
            const worksheet = XLSX.utils.json_to_sheet(exportData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
            XLSX.writeFile(workbook, `${filename}.xlsx`);
        }
        setIsDownloadOpen(false);
    };


    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="w-full flex flex-col gap-8 pb-20">
            <div className="animate-in slide-in-from-bottom-2 fade-in duration-500">
                <h1 className="text-3xl font-bold text-foreground">{t("settings.title")}</h1>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-300 mt-1">
                    {t("settings.subtitle")}
                </p>
            </div>

            <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-4 fade-in duration-700">

                {/* Patrimônio Container */}
                <div className="flex flex-col gap-6">
                    <div className="rounded-xl bg-surface border border-border shadow-sm p-6 flex flex-col">
                        <div className="flex items-center gap-2 mb-6 text-primary border-b border-border pb-4">
                            <span className="material-symbols-outlined text-[24px]">account_balance_wallet</span>
                            <h3 className="text-xl font-bold text-foreground">Patrimônio</h3>
                        </div>

                        {/* Classifications */}
                        <div className="flex flex-col mb-8">
                            <div className="flex justify-between items-center mb-4">
                                <h4 className="text-sm font-bold text-primary uppercase tracking-wider">{t("settings.classifications")}</h4>
                                <button
                                    type="button"
                                    onClick={() => saveSettingsSection("class")}
                                    className="p-1.5 rounded-lg hover:bg-border text-slate-400 hover:text-primary transition-colors cursor-pointer"
                                    disabled={savingSettings.type === "class"}
                                >
                                    <span className={cn(
                                        "material-symbols-outlined text-[18px]",
                                        savingSettings.type === "class" && "animate-pulse"
                                    )}>save</span>
                                </button>
                            </div>
                            <div className="flex gap-2 mb-4">
                                <input
                                    value={newClassification}
                                    onChange={e => setNewClassification(e.target.value)}
                                    onKeyDown={e => e.key === "Enter" && addClassification()}
                                    placeholder={t("settings.classPlaceholder")}
                                    className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                                <button type="button" onClick={addClassification} className="bg-primary hover:bg-primary/90 text-white px-3 py-1.5 rounded-lg text-sm font-bold transition-colors cursor-pointer">
                                    Adicionar
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2 min-h-[40px]">
                                {settings.classifications?.map(c => (
                                    <div key={c} className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-full text-xs font-semibold border border-border group transition-all hover:border-primary/30">
                                        {c}
                                        <button type="button" onClick={() => removeClassification(c)} className="text-slate-400 hover:text-red-500 transition-colors cursor-pointer">
                                            <span className="material-symbols-outlined text-[14px]">close</span>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Assets */}
                        <div className="flex flex-col">
                            <div className="flex justify-between items-center mb-4">
                                <h4 className="text-sm font-bold text-primary uppercase tracking-wider">{t("settings.assets")}</h4>
                                <button
                                    type="button"
                                    onClick={() => saveSettingsSection("asset")}
                                    className="p-1.5 rounded-lg hover:bg-border text-slate-400 hover:text-primary transition-colors cursor-pointer"
                                    disabled={savingSettings.type === "asset"}
                                >
                                    <span className={cn(
                                        "material-symbols-outlined text-[18px]",
                                        savingSettings.type === "asset" && "animate-pulse"
                                    )}>save</span>
                                </button>
                            </div>
                            <div className="flex gap-2 mb-4">
                                <input
                                    value={newAsset}
                                    onChange={e => setNewAsset(e.target.value)}
                                    onKeyDown={e => e.key === "Enter" && addAsset()}
                                    placeholder={t("settings.assetPlaceholder")}
                                    className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                                <button type="button" onClick={addAsset} className="bg-primary hover:bg-primary/90 text-white px-3 py-1.5 rounded-lg text-sm font-bold transition-colors cursor-pointer">
                                    Adicionar
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2 min-h-[40px]">
                                {settings.assets?.map(a => (
                                    <div key={a} className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-full text-xs font-semibold border border-border group transition-all hover:border-primary/30">
                                        {a}
                                        <button type="button" onClick={() => removeAsset(a)} className="text-slate-400 hover:text-red-500 transition-colors cursor-pointer">
                                            <span className="material-symbols-outlined text-[14px]">close</span>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Financeiro Container */}
                <div className="flex flex-col gap-6">
                    <div className="rounded-xl bg-surface border border-border shadow-sm p-6 flex flex-col">
                        <div className="flex items-center gap-2 mb-6 text-primary border-b border-border pb-4">
                            <span className="material-symbols-outlined text-[24px]">payments</span>
                            <h3 className="text-xl font-bold text-foreground">Financeiro</h3>
                        </div>

                        {/* Income Categories */}
                        <div className="flex flex-col mb-8">
                            <div className="flex justify-between items-center mb-4">
                                <h4 className="text-sm font-bold text-primary uppercase tracking-wider">Receitas</h4>
                                <button
                                    type="button"
                                    onClick={() => saveSettingsSection("income")}
                                    className="p-1.5 rounded-lg hover:bg-border text-slate-400 hover:text-primary transition-colors cursor-pointer"
                                    disabled={savingSettings.type === "income"}
                                >
                                    <span className={cn(
                                        "material-symbols-outlined text-[18px]",
                                        savingSettings.type === "income" && "animate-pulse"
                                    )}>save</span>
                                </button>
                            </div>
                            <div className="flex gap-2 mb-4">
                                <input
                                    value={newIncomeCategory}
                                    onChange={e => setNewIncomeCategory(e.target.value)}
                                    onKeyDown={e => e.key === "Enter" && addIncomeCategory()}
                                    placeholder="Ex: Salário"
                                    className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                                <button type="button" onClick={addIncomeCategory} className="bg-primary hover:bg-primary/90 text-white px-3 py-1.5 rounded-lg text-sm font-bold transition-colors cursor-pointer">
                                    Adicionar
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2 min-h-[40px]">
                                {settings.incomeCategories?.map(c => (
                                    <div key={c} className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-full text-xs font-semibold border border-border group transition-all hover:border-primary/30">
                                        {c}
                                        <button type="button" onClick={() => removeIncomeCategory(c)} className="text-slate-400 hover:text-red-500 transition-colors cursor-pointer">
                                            <span className="material-symbols-outlined text-[14px]">close</span>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Expense Categories */}
                        <div className="flex flex-col">
                            <div className="flex justify-between items-center mb-4">
                                <h4 className="text-sm font-bold text-primary uppercase tracking-wider">Despesas</h4>
                                <button
                                    type="button"
                                    onClick={() => saveSettingsSection("expense")}
                                    className="p-1.5 rounded-lg hover:bg-border text-slate-400 hover:text-primary transition-colors cursor-pointer"
                                    disabled={savingSettings.type === "expense"}
                                >
                                    <span className={cn(
                                        "material-symbols-outlined text-[18px]",
                                        savingSettings.type === "expense" && "animate-pulse"
                                    )}>save</span>
                                </button>
                            </div>
                            <div className="flex gap-2 mb-4">
                                <input
                                    value={newExpenseCategory}
                                    onChange={e => setNewExpenseCategory(e.target.value)}
                                    onKeyDown={e => e.key === "Enter" && addExpenseCategory()}
                                    placeholder="Ex: Alimentação"
                                    className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                                <button type="button" onClick={addExpenseCategory} className="bg-primary hover:bg-primary/90 text-white px-3 py-1.5 rounded-lg text-sm font-bold transition-colors cursor-pointer">
                                    Adicionar
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2 min-h-[40px]">
                                {settings.expenseCategories?.map(c => (
                                    <div key={c} className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-full text-xs font-semibold border border-border group transition-all hover:border-primary/30">
                                        {c}
                                        <button type="button" onClick={() => removeExpenseCategory(c)} className="text-slate-400 hover:text-red-500 transition-colors cursor-pointer">
                                            <span className="material-symbols-outlined text-[14px]">close</span>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Meta de Gastos Section */}
                <div className="rounded-xl bg-surface border border-border shadow-sm p-6 flex flex-col mt-6">
                    <section className="space-y-6">
                        <div className="flex justify-between items-center border-b border-border pb-4">
                            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary text-[24px]">target</span>
                                {t("settings.spendingGoals")}
                            </h3>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-500 uppercase font-semibold">{t("settings.monthly")}</span>
                                <button
                                    type="button"
                                    onClick={saveBudgets}
                                    className="p-1.5 rounded-lg hover:bg-border text-slate-400 hover:text-primary transition-colors cursor-pointer"
                                    disabled={savingSettings.type === "budget"}
                                >
                                    <span className={cn(
                                        "material-symbols-outlined text-[18px]",
                                        savingSettings.type === "budget" && "animate-pulse"
                                    )}>save</span>
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-12 gap-4 items-center">
                            <div className="col-span-3">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{t("settings.spending")}</span>
                            </div>
                            <div className="col-span-3">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{t("settings.goal")} (R$)</span>
                            </div>
                            <div className="col-span-6">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{t("settings.goalWeight")}</span>
                            </div>
                        </div>

                        <div className="space-y-4">
                            {settings.expenseCategories?.map((cat: string) => {
                                const budget = budgets.find(b => b.Category === cat)?.Budget || 0;
                                const totalBudget = budgets.reduce((acc, b) => acc + b.Budget, 0);
                                const weight = totalBudget > 0 ? (budget / totalBudget) * 100 : 0;

                                return (
                                    <div key={cat} className="grid grid-cols-12 gap-4 items-center group">
                                        <div className="col-span-3">
                                            <span className="text-sm font-medium text-foreground">{cat}</span>
                                        </div>
                                        <div className="col-span-3">
                                            <FormattedNumberInput
                                                value={budget > 0 ? budget : 0}
                                                onChange={val => {
                                                    setBudgets(prev => {
                                                        const filtered = prev.filter(b => b.Category !== cat);
                                                        return [...filtered, { Category: cat, Budget: val }].sort((a, b) => a.Category.localeCompare(b.Category));
                                                    });
                                                }}
                                                placeholder="Ex: 0,00"
                                                className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none transition-all font-medium"
                                            />
                                        </div>
                                        <div className="col-span-6 flex flex-col items-start gap-1.5">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase">{weight.toFixed(0)}%</span>
                                            <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                <div
                                                    className="bg-primary h-full transition-all duration-500"
                                                    style={{ width: `${weight}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex items-center justify-between p-6 bg-primary/5 border border-primary/10 rounded-xl mt-8 animate-in fade-in zoom-in duration-500">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-primary uppercase tracking-widest">{t("settings.totalPlanned")}</span>
                                <span className="text-2xl font-black text-foreground">
                                    {formatCurrency(budgets.reduce((acc, b) => acc + b.Budget, 0))}
                                </span>
                            </div>
                            <button
                                onClick={saveBudgets}
                                disabled={savingSettings.type === "budget"}
                                className="bg-primary hover:bg-primary/90 text-white font-bold py-3 px-10 rounded-lg transition-all shadow-lg shadow-primary/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                            >
                                <span className="material-symbols-outlined">save</span>
                                {t("settings.saveGoals")}
                            </button>
                        </div>
                    </section>
                </div>
            </div>

            {/* Database View/Edit */}
            <div className="rounded-xl bg-surface border border-border shadow-sm flex flex-col animate-in slide-in-from-bottom-8 fade-in duration-1000 overflow-hidden">
                <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-background/50">
                    <div>
                        <h3 className="text-lg font-bold text-foreground">{t("settings.rawDatabase")}</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-300 mt-0.5">{t("settings.editCells")}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={saveDatabase}
                            disabled={saving || importingFile}
                            className="flex items-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-[18px]">save</span>
                            {saving ? t("settings.saving") : t("settings.saveChanges")}
                        </button>
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={saving || importingFile}
                            className="flex items-center gap-2 bg-surface border border-border hover:bg-border disabled:opacity-50 text-foreground px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-[18px]">upload_file</span>
                            {importingFile ? t("settings.importing") : t("settings.importFile")}
                        </button>

                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setIsDownloadOpen(!isDownloadOpen)}
                                className="flex items-center gap-2 bg-surface border border-border hover:bg-border text-foreground px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-[18px]">download</span>
                                {t("settings.downloadData")}
                            </button>

                            {isDownloadOpen && (
                                <>
                                    <div className="fixed inset-0 z-30" onClick={() => setIsDownloadOpen(false)} />
                                    <div className="absolute right-0 mt-2 w-48 rounded-xl bg-surface border border-border shadow-xl z-40 py-1 overflow-hidden animate-in fade-in zoom-in duration-200">
                                        <button
                                            onClick={() => downloadFile("csv")}
                                            className="w-full text-left px-4 py-2.5 text-sm font-medium text-foreground hover:bg-border transition-colors flex items-center gap-2"
                                        >
                                            <span className="material-symbols-outlined text-[18px] text-slate-400">csv</span>
                                            {t("settings.downloadCsv")}
                                        </button>
                                        <button
                                            onClick={() => downloadFile("xlsx")}
                                            className="w-full text-left px-4 py-2.5 text-sm font-medium text-foreground hover:bg-border transition-colors flex items-center gap-2"
                                        >
                                            <span className="material-symbols-outlined text-[18px] text-slate-400">table_view</span>
                                            {t("settings.downloadExcel")}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        className="hidden"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) importDatabaseFile(file);
                        }}
                    />
                </div>

                <div className="overflow-x-auto max-h-[400px] overflow-y-auto relative scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
                    <table className="w-full text-left border-separate border-spacing-0">
                        <thead className="sticky top-0 z-20 bg-surface shadow-sm font-bold">
                            <tr className="text-xs uppercase text-slate-500 tracking-wider">
                                <th className="px-4 py-3 border-b border-border bg-surface/95 backdrop-blur-sm sticky top-0">{t("settings.date")}</th>
                                <th className="px-4 py-3 border-b border-border bg-surface/95 backdrop-blur-sm sticky top-0">{t("settings.classification")}</th>
                                <th className="px-4 py-3 border-b border-border bg-surface/95 backdrop-blur-sm sticky top-0">{t("settings.asset")}</th>
                                <th className="px-4 py-3 border-b border-border bg-surface/95 backdrop-blur-sm sticky top-0 text-right">{t("settings.value")}</th>
                                <th className="px-4 py-3 border-b border-border bg-surface/95 backdrop-blur-sm sticky top-0 text-center">{t("common.actions")}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border text-sm">
                            {data.map((row, index) => (
                                <tr key={`${row.Date}-${row.Asset}-${index}`} className="hover:bg-blue-50/50 dark:hover:bg-white/5 transition-colors group">
                                    <td className="px-4 py-1">
                                        {editingRowIndex === index ? (
                                            <input
                                                type="date"
                                                value={csvDateToInputDate(row.Date)}
                                                onChange={(e) => handleDataChange(index, "Date", inputDateToCsvDate(e.target.value))}
                                                className="bg-background border-b border-border focus:border-primary focus:outline-none py-0.5 w-full text-foreground"
                                            />
                                        ) : (
                                            <span className="text-slate-600 dark:text-slate-400">{row.Date}</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-1">
                                        {editingRowIndex === index ? (
                                            <select
                                                value={row.Classification}
                                                onChange={(e) => handleDataChange(index, "Classification", e.target.value)}
                                                className="bg-background border-b border-border focus:border-primary focus:outline-none py-0.5 w-full text-foreground"
                                            >
                                                <option value={row.Classification}>{row.Classification}</option>
                                                {settings.classifications
                                                    .filter((c: string) => c !== row.Classification)
                                                    .sort((a, b) => a.localeCompare(b))
                                                    .map(c => (
                                                        <option key={c} value={c}>{c}</option>
                                                    ))}
                                            </select>
                                        ) : (
                                            <span className="font-medium text-foreground">{row.Classification}</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-1">
                                        {editingRowIndex === index ? (
                                            <select
                                                value={row.Asset}
                                                onChange={(e) => handleDataChange(index, "Asset", e.target.value)}
                                                className="bg-background border-b border-border focus:border-primary focus:outline-none py-0.5 w-full text-foreground"
                                            >
                                                <option value={row.Asset}>{row.Asset}</option>
                                                {settings.assets
                                                    .filter((a: string) => a !== row.Asset)
                                                    .sort((a, b) => a.localeCompare(b))
                                                    .map(a => (
                                                        <option key={a} value={a}>{a}</option>
                                                    ))}
                                            </select>
                                        ) : (
                                            <span className="font-medium text-foreground">{row.Asset}</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-1 text-right">
                                        {editingRowIndex === index ? (
                                            <FormattedNumberInput
                                                value={row.Value}
                                                onChange={(n: number) => handleDataChange(index, "Value", String(n))}
                                                compactSpinner
                                                className="bg-background border-b border-border focus:border-primary focus:outline-none py-0.5 w-full text-right text-foreground font-medium"
                                            />
                                        ) : (
                                            <span className="font-bold text-foreground">{formatCurrency(row.Value)}</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-1 text-center">
                                        <div className="flex justify-center gap-2">
                                            {editingRowIndex === index ? (
                                                <>
                                                    <button onClick={() => setEditingRowIndex(null)} className="text-green-500 hover:text-green-600 transition-colors">
                                                        <span className="material-symbols-outlined text-lg">check_circle</span>
                                                    </button>
                                                    <button onClick={() => setEditingRowIndex(null)} className="text-slate-400 hover:text-slate-500">
                                                        <span className="material-symbols-outlined text-lg">cancel</span>
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <button onClick={() => setEditingRowIndex(index)} className="text-primary hover:text-primary/80 transition-colors">
                                                        <span className="material-symbols-outlined text-lg">edit</span>
                                                    </button>
                                                    <button onClick={(e) => deleteRow(e, index)} className="text-slate-400 hover:text-red-500 transition-colors">
                                                        <span className="material-symbols-outlined text-lg">delete</span>
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="flex justify-end animate-in slide-in-from-bottom-8 fade-in duration-1000">
                <button
                    type="button"
                    onClick={() => setIsExportDialogOpen(true)}
                    className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors cursor-pointer"
                >
                    <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                    {t("settings.exportPdf")}
                </button>
            </div>

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
                                    onClick={exportSelectedTabsAsPdf}
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

            <ConfirmModal
                isOpen={modalConfig.isOpen}
                title={modalConfig.title}
                message={modalConfig.message}
                confirmLabel={modalConfig.confirmLabel}
                variant={modalConfig.variant}
                onConfirm={modalConfig.onConfirm}
                onCancel={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
            />
        </div>
    );
}
