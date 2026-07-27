"use client";

import { useTranslation } from "@/lib/i18n";

interface AccountSectionProps {
    email: string | null;
    onSignOut: () => void;
}

export function AccountSection({ email, onSignOut }: AccountSectionProps) {
    const { t } = useTranslation();

    return (
        <div className="rounded-xl bg-surface border border-border shadow-sm p-6 flex flex-col gap-6">
            <div className="flex items-center gap-2 text-primary border-b border-border pb-4">
                <span className="material-symbols-outlined text-[24px]">person</span>
                <h3 className="text-xl font-bold text-foreground">{t("settings.accountTitle")}</h3>
            </div>

            <div className="flex items-center gap-4 p-4 rounded-xl border border-border bg-background/50">
                <div className="flex items-center justify-center size-12 rounded-full bg-primary/10 text-primary shrink-0">
                    <span className="material-symbols-outlined text-[28px]">account_circle</span>
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        {t("settings.accountEmail")}
                    </p>
                    <p className="text-sm font-semibold text-foreground truncate">
                        {email ?? t("settings.accountNoEmail")}
                    </p>
                </div>
            </div>

            <button
                type="button"
                onClick={onSignOut}
                className="flex items-center justify-center gap-2 w-full sm:w-auto sm:self-start px-5 py-3 rounded-lg text-sm font-bold text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            >
                <span className="material-symbols-outlined text-[18px]">logout</span>
                {t("settings.accountSignOut")}
            </button>
        </div>
    );
}
