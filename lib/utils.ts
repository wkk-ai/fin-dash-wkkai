import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function parseCustomDate(dateStr: string): Date {
    if (!dateStr) return new Date();

    // Try format: DD/MM/YYYY or DD/MM/YY
    const numericMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (numericMatch) {
        const [, d, m, y] = numericMatch;
        const day = parseInt(d, 10);
        const month = parseInt(m, 10) - 1;
        let year = parseInt(y, 10);
        if (year < 100) year += 2000;
        const result = new Date(year, month, day);
        if (!isNaN(result.getTime())) return result;
    }

    // Try format: "01/jan./22" or "01/Feb/23"
    const alphaMatch = dateStr.match(/^(\d{1,2})\/([a-zA-Z.]+)\/(\d{2,4})$/);
    if (alphaMatch) {
        const [, dayStr, monthStr, yearStr] = alphaMatch;
        const day = parseInt(dayStr, 10);
        let year = parseInt(yearStr, 10);
        if (year < 100) year += 2000;

        const cleanMonth = monthStr.toLowerCase().replace(".", "");
        const months: Record<string, number> = {
            jan: 0,
            feb: 1, fev: 1,
            mar: 2,
            apr: 3, abr: 3,
            may: 4, mai: 4,
            jun: 5,
            jul: 6,
            aug: 7, ago: 7,
            sep: 8, set: 8,
            oct: 9, out: 9,
            nov: 10,
            dec: 11, dez: 11,
        };

        const month = months[cleanMonth] ?? 0;
        const result = new Date(year, month, day);
        if (!isNaN(result.getTime())) return result;
    }

    // Fallback to standard parsing
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
