"use client";

import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type SettingsTab = "tags" | "budgets" | "data" | "import" | "account";

const TABS: { id: SettingsTab; icon: string; labelKey: string }[] = [
    { id: "tags", icon: "sell", labelKey: "settings.tabTags" },
    { id: "budgets", icon: "target", labelKey: "settings.tabBudgets" },
    { id: "data", icon: "table", labelKey: "settings.tabData" },
    { id: "import", icon: "upload_file", labelKey: "settings.tabImport" },
    { id: "account", icon: "person", labelKey: "settings.tabAccount" },
];

interface SettingsTabsProps {
    active: SettingsTab;
    onChange: (tab: SettingsTab) => void;
}

export function SettingsTabs({ active, onChange }: SettingsTabsProps) {
    const { t } = useTranslation();

    return (
        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-border -mx-1 px-1">
            <div className="flex gap-1 min-w-max border-b border-border">
                {TABS.map((tab) => {
                    const isActive = active === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => onChange(tab.id)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-3 text-sm font-semibold whitespace-nowrap transition-colors border-b-2 -mb-px",
                                isActive
                                    ? "border-primary text-primary"
                                    : "border-transparent text-slate-500 dark:text-slate-400 hover:text-foreground hover:border-border"
                            )}
                        >
                            <span className={cn("material-symbols-outlined text-[20px]", isActive && "font-bold")}>
                                {tab.icon}
                            </span>
                            {t(tab.labelKey)}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
