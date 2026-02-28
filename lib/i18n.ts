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
            const [loc, curr] =
                locale === "pt-BR" ? ["pt-BR", "BRL"] as const :
                locale === "es-ES" ? ["es-ES", "EUR"] as const :
                ["en-US", "USD"] as const;
            return new Intl.NumberFormat(loc, { style: "currency", currency: curr }).format(value);
        },
        [locale]
    );

    return { t, locale, formatCurrency };
}
