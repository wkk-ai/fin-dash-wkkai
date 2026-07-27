"use client";

import { useTranslation } from "@/lib/i18n";
import { EmptyHint } from "./EmptyHint";

interface Props {
    onBackupJson: () => void;
    onDownloadCsv: () => void;
    onDownloadXlsx: () => void;
    onExportPdf: () => void;
    exportingPdf: boolean;
    onImportClick: () => void;
    importing: boolean;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function ImportExportSection({
    onBackupJson,
    onDownloadCsv,
    onDownloadXlsx,
    onExportPdf,
    exportingPdf,
    onImportClick,
    importing,
    fileInputRef,
    onFileChange,
}: Props) {
    const { t } = useTranslation();

    const card = (
        icon: string,
        title: string,
        desc: string,
        action: string,
        onClick: () => void,
        busy?: boolean,
        danger?: boolean
    ) => (
        <div
            className={`rounded-xl border p-5 flex flex-col gap-3 ${
                danger ? "border-red-500/30 bg-red-500/5" : "border-border bg-surface"
            }`}
        >
            <div className="flex items-center gap-2">
                <span className={`material-symbols-outlined ${danger ? "text-red-500" : "text-primary"}`}>
                    {icon}
                </span>
                <h3 className="font-bold text-foreground">{title}</h3>
            </div>
            <p className="text-xs text-slate-500 flex-1">{desc}</p>
            <button
                type="button"
                onClick={onClick}
                disabled={busy}
                className={`mt-1 rounded-lg px-4 py-2.5 text-sm font-bold transition-colors disabled:opacity-50 ${
                    danger
                        ? "bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20"
                        : "bg-primary text-white hover:bg-primary/90"
                }`}
            >
                {busy ? t("settings.saving") : action}
            </button>
        </div>
    );

    return (
        <div className="flex flex-col gap-8">
            <div>
                <h2 className="text-lg font-bold text-foreground mb-1">{t("settings.backupTitle")}</h2>
                <p className="text-sm text-slate-500 mb-4">{t("settings.backupSubtitle")}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {card(
                        "backup",
                        t("settings.backupFull"),
                        t("settings.backupFullDesc"),
                        t("settings.backupNow"),
                        onBackupJson
                    )}
                    {card(
                        "csv",
                        t("settings.downloadCsv"),
                        t("settings.downloadCsvDesc"),
                        t("settings.downloadCsv"),
                        onDownloadCsv
                    )}
                    {card(
                        "table_view",
                        t("settings.downloadExcel"),
                        t("settings.downloadExcelDesc"),
                        t("settings.downloadExcel"),
                        onDownloadXlsx
                    )}
                    {card(
                        "picture_as_pdf",
                        t("settings.exportPdf"),
                        t("settings.exportPdfDesc"),
                        exportingPdf ? t("settings.exportingPdf") : t("settings.exportPdf"),
                        onExportPdf,
                        exportingPdf
                    )}
                </div>
            </div>

            <div>
                <h2 className="text-lg font-bold text-red-600 dark:text-red-400 mb-1">
                    {t("settings.dangerZone")}
                </h2>
                <p className="text-sm text-slate-500 mb-4">{t("settings.dangerZoneDesc")}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {card(
                        "upload_file",
                        t("settings.importFile"),
                        t("settings.importDangerDesc"),
                        importing ? t("settings.importing") : t("settings.importFile"),
                        onImportClick,
                        importing,
                        true
                    )}
                </div>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls,.json"
                    className="hidden"
                    onChange={onFileChange}
                />
            </div>
        </div>
    );
}
