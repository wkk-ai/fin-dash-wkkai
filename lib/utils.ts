import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function parseCustomDate(dateStr: string): Date {
    // Expected format: "01/jan./22" or "01/Feb/23"
    // Month can have dots and mixed cases
    const match = dateStr.match(/(\d+)\/([a-zA-Z.]+)\/(\d+)/);
    if (!match) return new Date(dateStr); // fallback to standard parsing

    const [, dayStr, monthStr, yearStr] = match;
    const day = parseInt(dayStr, 10);
    const year = 2000 + parseInt(yearStr, 10); // assuming 2000s

    const cleanMonth = monthStr.toLowerCase().replace(".", "");
    const months: Record<string, number> = {
        jan: 0,
        feb: 1,
        mar: 2,
        apr: 3,
        may: 4,
        jun: 5,
        jul: 6,
        aug: 7,
        sep: 8,
        oct: 9,
        nov: 10,
        dec: 11,
    };

    const month = months[cleanMonth] ?? 0;
    return new Date(year, month, day);
}

export function formatCurrency(value: number) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
    }).format(value);
}
