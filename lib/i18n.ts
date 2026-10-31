"use client";

import { useCallback } from "react";
import { useLanguage } from "./language-context";

export type Locale = "pt-BR" | "en-US" | "es-ES";

function getNested(obj: Record<string, unknown>, path: string): string | undefined {
    const parts = path.split(".");
    let current: unknown = obj;
    for (const p of parts) {
        if (current == null || typeof current !== "object") return undefined;
        current = (current as Record<string, unknown>)[p];
    }
    return typeof current === "string" ? current : undefined;
}

function interpolate(str: string, vars: Record<string, string | number>): string {
    return str.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

export function useTranslation() {
    const { locale, messages } = useLanguage();

    const t = useCallback(
        (key: string, vars?: Record<string, string | number>): string => {
            const msg = getNested(messages as Record<string, unknown>, key);
            const s = msg ?? key;
            return vars ? interpolate(s, vars) : s;
        },
        [messages]
    );

    const formatCurrency = useCallback(
        (value: number) => {
            // All values are stored in reais: the language only changes number formatting, never the currency.
            return new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format(value);
        },
        [locale]
    );

    /** Short money label for chart axes and donut centres, e.g. "R$ 750 mil", "R$ 1,2 mi". */
    const formatCompactCurrency = useCallback(
        (value: number) =>
            new Intl.NumberFormat(locale, {
                style: "currency",
                currency: "BRL",
                notation: "compact",
                maximumFractionDigits: Math.abs(value) >= 1_000_000 ? 1 : 0,
            }).format(value),
        [locale]
    );

    return { t, locale, formatCurrency, formatCompactCurrency };
}
