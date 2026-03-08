import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function parseCustomDate(dateStr: string): Date {
    if (!dateStr) return new Date();

    // Standardize separators
    const cleanStr = dateStr.trim().replace(/[-.]/g, '/');

    // Try format: YYYY/MM/DD
    const ymdMatch = cleanStr.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (ymdMatch) {
        const [, y, m, d] = ymdMatch;
        return new Date(Date.UTC(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10)));
    }

    // Try format: DD/MM/YYYY or MM/DD/YYYY or DD/MM/YY or MM/DD/YY
    const dmyMatch = cleanStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (dmyMatch) {
        let [, first, second, yearStr] = dmyMatch;
        let day = parseInt(first, 10);
        let month = parseInt(second, 10);
        let year = parseInt(yearStr, 10);
        if (year < 100) year += 2000;

        // Heuristic: if first > 12, it must be day (DD/MM)
        // If second > 12, it must be day (MM/DD)
        if (day > 12) {
            // Must be DD/MM
            return new Date(Date.UTC(year, month - 1, day));
        } else if (month > 12) {
            // Must be MM/DD
            return new Date(Date.UTC(year, day - 1, month));
        }

        // Default to DD/MM if ambiguous (or user preference)
        // Brazilian users (kazuo) typically use DD/MM
        return new Date(Date.UTC(year, month - 1, day));
    }

    // Try format: "01/jan/22" or "01/Feb/23" or "01/março/2025"
    const alphaMatch = cleanStr.match(/^(\d{1,2})\/([^/]+)\/(\d{2,4})$/);
    if (alphaMatch) {
        const [, dayStr, monthStr, yearStr] = alphaMatch;
        const day = parseInt(dayStr, 10);
        let year = parseInt(yearStr, 10);
        if (year < 100) year += 2000;

        const months: Record<string, number> = {
            jan: 0, jane: 0,
            feb: 1, fev: 1, feve: 1,
            mar: 2, marc: 2, març: 2,
            apr: 3, abr: 3, abri: 3,
            may: 4, mai: 4, maio: 4,
            jun: 5, junh: 5,
            jul: 6, julh: 6,
            aug: 7, ago: 7, agos: 7,
            sep: 8, set: 8, sete: 8,
            oct: 9, out: 9, outu: 9,
            nov: 10, nove: 10,
            dec: 11, dez: 11, deze: 11
        };

        const cleanMonth = monthStr.toLowerCase().replace(".", "");
        const month = months[cleanMonth.slice(0, 4)] ?? months[cleanMonth.slice(0, 3)] ?? 0;

        // Use Date.UTC to avoid timezone issues and let it handle day overflow (e.g. Feb 29 -> Mar 01)
        const timestamp = Date.UTC(year, month, day);
        return new Date(timestamp);
    }

    const fallback = new Date(dateStr);
    return isNaN(fallback.getTime()) ? new Date() : fallback;
}

export function formatCurrency(value: number) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
    }).format(value);
}

export type Locale = "pt-BR" | "en-US" | "es-ES";

export function formatNumber(value: number, locale: Locale): string {
    const opts: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    return new Intl.NumberFormat(locale === "pt-BR" || locale === "es-ES" ? "pt-BR" : "en-US", opts).format(value);
}

export function parseFormattedNumber(str: string, locale: Locale): number {
    const s = str.trim().replace(/\s/g, "");
    if (!s) return NaN;
    if (locale === "pt-BR" || locale === "es-ES") {
        const cleaned = s.replace(/\./g, "").replace(",", ".");
        return parseFloat(cleaned) || NaN;
    }
    const cleaned = s.replace(/,/g, "");
    return parseFloat(cleaned) || NaN;
}
