"use client";

import { useEffect, useRef } from "react";
import { useTranslation } from "@/lib/i18n";
import "./stocks.css";

const BASE = (process.env.NODE_ENV === "production" ? "/fin-dash-wkkai" : "") + "/stocks/";

const TABS: { tab: string; href: string; icon: string; labelKey: string }[] = [
    { tab: "hoje", href: "#/", icon: "today", labelKey: "stocks.tabToday" },
    { tab: "mapa", href: "#/mapa", icon: "bubble_chart", labelKey: "stocks.tabMap" },
    { tab: "rankings", href: "#/rankings", icon: "leaderboard", labelKey: "stocks.tabRankings" },
    { tab: "dividendos", href: "#/dividendos", icon: "payments", labelKey: "stocks.tabDividends" },
    { tab: "setores", href: "#/setores", icon: "category", labelKey: "stocks.tabSectors" },
    { tab: "explorar", href: "#/explorar", icon: "table_rows", labelKey: "stocks.tabExplore" },
    { tab: "comparar", href: "#/comparar", icon: "compare_arrows", labelKey: "stocks.tabCompare" },
    { tab: "lista", href: "#/lista", icon: "star", labelKey: "stocks.tabList" },
    { tab: "metodo", href: "#/metodo", icon: "menu_book", labelKey: "stocks.tabMethod" },
];

type StocksWindow = Window & { __STOCKS_BASE?: string; StocksApp?: { start: (el: HTMLElement) => void } };

/**
 * Ações: the stock screener. Its screens are drawn by the bundle in public/stocks/app.js
 * (source in stocks/src, data refreshed daily by pipeline/). This page gives it the
 * dashboard's shell: title, section tabs, market switch.
 */
export default function StocksPage() {
    const { t } = useTranslation();
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const w = window as StocksWindow;
        w.__STOCKS_BASE = BASE;
        const start = () => { if (ref.current && w.StocksApp) w.StocksApp.start(ref.current); };
        // The screener moves between its screens with #hash links. Those history entries are created by the
        // browser, not by Next, so they carry no router state and the Back button from another page would not
        // return here. Copy this page's router state onto each of them.
        const routerState = window.history.state;
        const keepRouterState = () => {
            if (window.history.state == null && routerState) window.history.replaceState(routerState, "", window.location.href);
        };
        window.addEventListener("hashchange", keepRouterState);
        if (w.StocksApp) start();
        else {
            const s = document.createElement("script");
            s.src = `${BASE}app.js?v=${process.env.NEXT_PUBLIC_BUILD ?? ""}`;
            s.onload = start;
            document.body.appendChild(s);
        }
        return () => window.removeEventListener("hashchange", keepRouterState);
    }, []);

    return (
        <div className="stocks flex flex-col">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="!text-2xl md:!text-3xl font-bold text-foreground !max-w-none">{t("stocks.title")}</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t("stocks.subtitle")}</p>
                </div>
                <div
                    id="stk-mkt"
                    role="group"
                    aria-label={t("stocks.market")}
                    className="flex items-center self-start md:self-auto rounded-lg border border-border bg-border/40 p-0.5 text-xs sm:text-sm font-bold"
                >
                    <button type="button" data-mkt="BR">{t("stocks.marketBR")}</button>
                    <button type="button" data-mkt="US">{t("stocks.marketUS")}</button>
                    <button type="button" data-mkt="ALL">{t("stocks.marketAll")}</button>
                </div>
            </div>

            <div className="overflow-x-auto -mx-1 px-1 mt-6 [scrollbar-width:none]">
                <nav id="stk-nav" aria-label={t("stocks.title")} className="flex gap-1 min-w-max border-b border-border">
                    {TABS.map((tab) => (
                        <a key={tab.tab} href={tab.href} data-tab={tab.tab}>
                            <span className="material-symbols-outlined text-[20px]">{tab.icon}</span>
                            {t(tab.labelKey)}
                        </a>
                    ))}
                </nav>
            </div>

            <div id="stocks-app" ref={ref} className="mt-8 min-h-[50vh]" />

            <p className="mt-10 text-xs text-slate-500 dark:text-slate-400 max-w-3xl">
                {t("stocks.disclaimer")} <span id="stk-stamp" />
            </p>
        </div>
    );
}
