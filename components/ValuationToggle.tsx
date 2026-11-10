"use client";

import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import { useValuation, ValuationMode } from "@/lib/valuation-context";

/** Switches the whole dashboard between market value and "na curva" for public bonds. */
export default function ValuationToggle() {
    const { t } = useTranslation();
    const { mode, setMode } = useValuation();
    const options: { value: ValuationMode; label: string; short: string; hint: string }[] = [
        { value: "market", label: t("valuation.market"), short: t("valuation.marketShort"), hint: t("valuation.marketHint") },
        { value: "curve", label: t("valuation.curve"), short: t("valuation.curveShort"), hint: t("valuation.curveHint") },
    ];

    return (
        <div
            role="radiogroup"
            aria-label={t("valuation.label")}
            title={t("valuation.label")}
            className="flex items-center rounded-lg border border-border bg-border/40 p-0.5 text-xs sm:text-sm font-bold"
        >
            {options.map((o) => {
                const active = mode === o.value;
                return (
                    <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        title={o.hint}
                        onClick={() => setMode(o.value)}
                        className={cn(
                            "rounded-md px-2 sm:px-3 py-1.5 transition-colors cursor-pointer whitespace-nowrap",
                            active
                                ? "bg-surface text-primary shadow-sm"
                                : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                        )}
                    >
                        <span className="sm:hidden">{o.short}</span>
                        <span className="hidden sm:inline">{o.label}</span>
                    </button>
                );
            })}
        </div>
    );
}
