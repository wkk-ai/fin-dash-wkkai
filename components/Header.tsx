"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useState, useEffect, useRef } from "react";
import NewEntryModal from "./NewEntryModal";
import AIImportModal from "./AIImportModal";
import LanguageSelector from "./LanguageSelector";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

export default function Header() {
    const { t } = useTranslation();
    const pathname = usePathname();
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isAIModalOpen, setIsAIModalOpen] = useState(false);
    const [isNavOpen, setIsNavOpen] = useState(false);
    const navMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setMounted(true);
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

                    {/* Menu hamburger para telas estreitas */}
                    <div className="relative md:hidden" ref={navMenuRef}>
                        <button
                            type="button"
                            onClick={() => setIsNavOpen((v) => !v)}
                            className="flex size-10 items-center justify-center rounded-lg bg-border text-foreground hover:text-primary transition-colors cursor-pointer"
                            aria-label={isNavOpen ? t("nav.closeMenu") : t("nav.openMenu")}
                            aria-expanded={isNavOpen}
                        >
                            <span className="material-symbols-outlined text-2xl">
                                {isNavOpen ? "close" : "menu"}
                            </span>
                        </button>
                        {isNavOpen && (
                            <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-border bg-surface shadow-lg py-2 animate-in fade-in slide-in-from-top-2 duration-200 z-50">
                                {navLinks.map((link) => {
                                    const isActive = pathname === link.href;
                                    return (
                                        <Link
                                            key={link.name}
                                            href={link.href}
                                            onClick={() => setIsNavOpen(false)}
                                            className={cn(
                                                "flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors",
                                                isActive
                                                    ? "text-primary bg-primary/10"
                                                    : "text-slate-600 dark:text-slate-400 hover:bg-border hover:text-foreground"
                                            )}
                                        >
                                            <span className={cn("material-symbols-outlined text-[20px]", isActive ? "text-primary" : "")}>{link.icon}</span>
                                            {link.name}
                                        </Link>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="h-6 w-px bg-border-light dark:bg-border-dark mx-2 hidden md:block"></div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsAIModalOpen(true)}
                            className="hidden sm:flex items-center gap-2 rounded-lg border border-primary/50 bg-primary/10 px-4 py-2 text-sm font-bold text-primary shadow-lg shadow-primary/10 hover:bg-primary/20 transition-all cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
                            <span className="truncate">AI Import</span>
                        </button>

                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="hidden sm:flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-[20px]">add</span>
                            <span className="truncate">Nova Entrada</span>
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

            {isModalOpen && (
                <NewEntryModal onClose={() => setIsModalOpen(false)} />
            )}

            {isAIModalOpen && (
                <AIImportModal onClose={() => setIsAIModalOpen(false)} />
            )}
        </>
    );
}
