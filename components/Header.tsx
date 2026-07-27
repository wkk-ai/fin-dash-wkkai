"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useState, useEffect, useRef } from "react";
import NewEntryModal from "./NewEntryModal";
import LanguageSelector from "./LanguageSelector";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

export default function Header() {
    const { t } = useTranslation();
    const pathname = usePathname();
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [entryStartAt, setEntryStartAt] = useState<"intent" | "ai">("intent");
    const [isNavOpen, setIsNavOpen] = useState(false);
    const navMenuRef = useRef<HTMLDivElement>(null);

    const openEntry = (startAt: "intent" | "ai" = "intent") => {
        setEntryStartAt(startAt);
        setIsModalOpen(true);
    };

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        const openFromElsewhere = (e: Event) => {
            const detail = (e as CustomEvent<{ startAt?: "intent" | "ai" }>).detail;
            openEntry(detail?.startAt ?? "intent");
        };
        window.addEventListener("open-new-entry", openFromElsewhere);
        return () => window.removeEventListener("open-new-entry", openFromElsewhere);
    }, []);

    useEffect(() => {
        setIsNavOpen(false);
    }, [pathname]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (navMenuRef.current && !navMenuRef.current.contains(e.target as Node)) {
                setIsNavOpen(false);
            }
        };
        if (isNavOpen) {
            document.addEventListener("click", handleClickOutside);
        }
        return () => document.removeEventListener("click", handleClickOutside);
    }, [isNavOpen]);

    const navLinks = [
        { name: t("nav.dashboard"), href: "/", icon: "home" },
        { name: t("nav.portfolio"), href: "/portfolio", icon: "account_balance_wallet" },
        { name: t("nav.movements"), href: "/movements", icon: "swap_horiz" },
        { name: t("nav.settings"), href: "/settings", icon: "settings" },
    ];

    return (
        <>
            <header className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between border-b border-border bg-surface/80 backdrop-blur-md px-6 py-3 lg:px-10 w-full">
                <div className="flex items-center gap-4">
                    <div className="flex size-8 items-center justify-center rounded-lg bg-primary/20 text-primary">
                        <span className="material-symbols-outlined text-2xl">grid_view</span>
                    </div>
                    <h2 className="text-slate-900 dark:text-white text-xl font-bold leading-tight tracking-tight">
                        {t("app.name")}
                    </h2>
                </div>

                <div className="flex flex-1 justify-end items-center gap-6">
                    <nav className="hidden md:flex gap-1 text-sm font-medium">
                        {navLinks.map((link) => {
                            const isActive = pathname === link.href;
                            return (
                                <Link
                                    key={link.name}
                                    href={link.href}
                                    className={cn(
                                        "flex items-center px-4 py-2 transition-colors group",
                                        isActive
                                            ? "text-slate-900 dark:text-white"
                                            : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                                    )}
                                >
                                    <div className="relative flex items-center gap-2 px-0.5 py-1">
                                        <span
                                            className={cn(
                                                "material-symbols-outlined text-[20px] transition-colors leading-none select-none",
                                                isActive ? "text-primary" : ""
                                            )}
                                        >
                                            {link.icon}
                                        </span>
                                        <span className={cn("whitespace-nowrap select-none transition-all", isActive ? "font-bold" : "font-medium")}>
                                            {link.name}
                                        </span>
                                        {isActive && (
                                            <span className="absolute -bottom-2.5 left-0 right-0 h-[2.5px] rounded-full bg-primary shadow-[0_0_10px_2px_rgba(59,130,246,0.6)]" />
                                        )}
                                    </div>
                                </Link>
                            );
                        })}
                    </nav>



                    <div className="h-6 w-px bg-border-light dark:bg-border-dark mx-2 hidden md:block"></div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => openEntry("ai")}
                            className="flex items-center gap-2 rounded-lg border border-primary/50 bg-primary/10 px-2.5 sm:px-4 py-2 text-sm font-bold text-primary shadow-lg shadow-primary/10 hover:bg-primary/20 transition-all cursor-pointer"
                            aria-label={t("nav.aiImport")}
                        >
                            <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
                            <span className="truncate hidden sm:inline">{t("nav.aiImport")}</span>
                        </button>

                        <button
                            onClick={() => openEntry("intent")}
                            className="hidden sm:flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-[20px]">add</span>
                            <span className="truncate">{t("nav.newEntry")}</span>
                        </button>

                        <button
                            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                            className="flex size-10 items-center justify-center rounded-full bg-border text-foreground hover:text-primary transition-colors cursor-pointer"
                        >
                            {mounted && theme === "dark" ? (
                                <span className="material-symbols-outlined">light_mode</span>
                            ) : (
                                <span className="material-symbols-outlined">dark_mode</span>
                            )}
                        </button>

                        <LanguageSelector />

                        <div
                            className="h-10 w-10 overflow-hidden rounded-full border-2 border-border bg-cover bg-center cursor-pointer"
                            style={{
                                backgroundImage:
                                    "url('https://lh3.googleusercontent.com/aida-public/AB6AXuB-rJfng0KyhGkJiCWmIJvB9HlLPnESXefXH1bippWZMNaRWP2jFbFMqd3MJTkf9RLxXVok646U5mpE-c5D1KENWG6wDrKTYBa15Y3ULhjGyGdjM1KAdj3WZpXpxr3UNB29dVuWOzupTt0ufvc8PlK7TxnUqKQZQaZ2gmMUxrA-r1u8WzuFk5pDJPViiKH7hVRnVrct7Y4oVJrjdzS4ydHnNcPXVRTbc4cpNR49DSJ4GOpk9QiZoOy0sc1lUvB9pszM3wPzB4fWXCGp')",
                            }}
                        ></div>
                    </div>
                </div>
            </header>

            {/* Bottom Navigation for Mobile */}
            <nav 
                className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between bg-surface border-t border-border px-4 pt-2 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]"
                style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)' }}
            >
                {navLinks.slice(0, 2).map((link) => {
                    const isActive = pathname === link.href;
                    return (
                        <Link key={link.name} href={link.href} className={cn("flex flex-col items-center p-2 min-w-[60px]", isActive ? "text-primary" : "text-slate-500 dark:text-slate-400")}>
                            <span className={cn("material-symbols-outlined text-[24px] mb-1", isActive && "font-bold")}>{link.icon}</span>
                            <span className="text-[10px] font-medium leading-none">{link.name}</span>
                        </Link>
                    );
                })}
                
                {/* Spacer for FAB */}
                <div className="w-[60px]"></div>

                {navLinks.slice(2, 4).map((link) => {
                    const isActive = pathname === link.href;
                    return (
                        <Link key={link.name} href={link.href} className={cn("flex flex-col items-center p-2 min-w-[60px]", isActive ? "text-primary" : "text-slate-500 dark:text-slate-400")}>
                            <span className={cn("material-symbols-outlined text-[24px] mb-1", isActive && "font-bold")}>{link.icon}</span>
                            <span className="text-[10px] font-medium leading-none">{link.name}</span>
                        </Link>
                    );
                })}

                {/* FAB — long-press opens AI */}
                <button
                    onClick={() => openEntry("intent")}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        openEntry("ai");
                    }}
                    className="absolute -top-5 left-1/2 -translate-x-1/2 flex items-center justify-center size-14 rounded-full bg-primary text-white shadow-[0_4px_14px_rgba(59,130,246,0.5)] border-4 border-surface outline-none transition-transform active:scale-95"
                    aria-label={t("nav.newEntry") || "Nova Entrada"}
                >
                    <span className="material-symbols-outlined text-3xl">add</span>
                </button>
            </nav>

            {isModalOpen && (
                <NewEntryModal
                    startAt={entryStartAt}
                    onClose={() => {
                        setIsModalOpen(false);
                        setEntryStartAt("intent");
                    }}
                />
            )}
        </>
    );
}
