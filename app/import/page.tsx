"use client";

import { useEffect, useRef } from "react";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { fetchNetWorth } from "@/lib/supabase-data";
import "./reader.css";

const BASE = (process.env.NODE_ENV === "production" ? "/fin-dash-wkkai" : "") + "/reader/";
const LOCAL_SETTINGS = "fintrack-reader-settings";

type ReaderOptions = {
    uid: string;
    history: unknown[];
    settings: Record<string, unknown>;
    saveSettings: (s: Record<string, unknown>) => Promise<void>;
    loadBonds: () => Promise<unknown[]>;
    send: (csv: string) => void;
};
type ReaderWindow = Window & { __READER_BASE?: string; ReaderApp?: { start: (el: HTMLElement, o: ReaderOptions) => void } };

async function loadSettings(): Promise<Record<string, unknown>> {
    const { data, error } = await supabase.from("reader_settings").select("data").maybeSingle();
    if (!error && data?.data) return data.data as Record<string, unknown>;
    try {
        return JSON.parse(localStorage.getItem(LOCAL_SETTINGS) || "{}");
    } catch {
        return {};
    }
}

async function saveSettings(s: Record<string, unknown>): Promise<void> {
    try {
        localStorage.setItem(LOCAL_SETTINGS, JSON.stringify(s));
    } catch {
        /* storage unavailable */
    }
    await supabase.from("reader_settings").upsert({ data: s, updated_at: new Date().toISOString() });
}

/**
 * Fechamento do mês: drop the month's prints of every bank, the app reads them, checks each list against
 * the totals the bank shows, and launches the month into the portfolio. Reading happens in this browser
 * (public/reader, source in reader/ and reader-ui/); the prints never leave the device.
 */
export default function ImportPage() {
    const { t } = useTranslation();
    const { user } = useAuth();
    const ref = useRef<HTMLDivElement>(null);
    const uid = user?.id ?? "anon";

    useEffect(() => {
        const w = window as ReaderWindow;
        w.__READER_BASE = BASE;
        let cancelled = false;
        const start = async () => {
            const [history, settings] = await Promise.all([fetchNetWorth().catch(() => []), loadSettings()]);
            if (cancelled || !ref.current || !w.ReaderApp) return;
            w.ReaderApp.start(ref.current, {
                uid,
                history,
                settings,
                saveSettings,
                loadBonds: async () => {
                    const { data } = await supabase.from("bond_purchases").select("*");
                    return data ?? [];
                },
                send: (csv) => window.dispatchEvent(new CustomEvent("open-new-entry", { detail: { startAt: "csv-portfolio", csv } })),
            });
        };
        if (w.ReaderApp) void start();
        else {
            const s = document.createElement("script");
            s.src = `${BASE}app.js?v=${process.env.NEXT_PUBLIC_BUILD ?? ""}`;
            s.onload = () => void start();
            document.body.appendChild(s);
        }
        return () => {
            cancelled = true;
        };
    }, [uid]);

    return (
        <div className="flex flex-col">
            <div className="mb-6">
                <h1 className="text-2xl md:text-3xl font-bold text-foreground">{t("closing.title")}</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-3xl">{t("closing.subtitle")}</p>
            </div>
            <div ref={ref} className="reader" />
        </div>
    );
}
