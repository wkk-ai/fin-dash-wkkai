import { AssetEntry } from "@/types/database";

export const PENDING_DB_KEY = "fin-dash-pending-db";

export function loadPendingData(): AssetEntry[] | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = sessionStorage.getItem(PENDING_DB_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as AssetEntry[];
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

export function savePendingData(data: AssetEntry[]) {
    if (typeof window === "undefined") return;
    try {
        sessionStorage.setItem(PENDING_DB_KEY, JSON.stringify(data));
    } catch {
        // ignore
    }
}

export function clearPendingData() {
    if (typeof window === "undefined") return;
    try {
        sessionStorage.removeItem(PENDING_DB_KEY);
    } catch {
        // ignore
    }
}
