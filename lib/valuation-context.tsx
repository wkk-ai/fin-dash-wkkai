"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AssetEntry } from "@/types/database";

/** How public bonds (Tesouro) are valued across the whole dashboard. */
export type ValuationMode = "market" | "curve";

const STORAGE_KEY = "fin-track-valuation";

type Ctx = { mode: ValuationMode; setMode: (m: ValuationMode) => void };
const ValuationContext = createContext<Ctx>({ mode: "market", setMode: () => {} });

export function ValuationProvider({ children }: { children: React.ReactNode }) {
    const [mode, setModeState] = useState<ValuationMode>("market");

    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            // Read once after mount (localStorage is not available during static render).
            // eslint-disable-next-line react-hooks/set-state-in-effect
            if (saved === "curve" || saved === "market") setModeState(saved);
        } catch {
            /* storage unavailable: keep default */
        }
    }, []);

    const setMode = useCallback((m: ValuationMode) => {
        setModeState(m);
        try {
            localStorage.setItem(STORAGE_KEY, m);
        } catch {
            /* ignore */
        }
    }, []);

    return <ValuationContext.Provider value={{ mode, setMode }}>{children}</ValuationContext.Provider>;
}

export function useValuation() {
    return useContext(ValuationContext);
}

/**
 * Rows as the chosen view should show them. In "curve" mode a public bond's
 * Value becomes its curve value; rows without one keep the market value.
 * Only for display: never save the result back to the database.
 */
export function applyValuation(data: AssetEntry[], mode: ValuationMode): AssetEntry[] {
    if (mode === "market") return data;
    return data.map((d) => (d.ValueCurve != null ? { ...d, Value: d.ValueCurve } : d));
}
