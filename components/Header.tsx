"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useState, useEffect } from "react";
import AddAssetModal from "./AddAssetModal";

export default function Header() {
    const pathname = usePathname();
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const navLinks = [
        { name: "Dashboard", href: "/" },
        { name: "Projeções", href: "/projections" },
        { name: "Carteira", href: "/portfolio" },
        { name: "Configurações", href: "/settings" },
    ];

    return (
        <>
            <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-surface/80 backdrop-blur-md px-6 py-3 lg:px-10">
                <div className="flex items-center gap-4">
                    <div className="flex size-8 items-center justify-center rounded-lg bg-primary/20 text-primary">
                        <span className="material-symbols-outlined text-2xl">grid_view</span>
                    </div>
                    <h2 className="text-slate-900 dark:text-white text-xl font-bold leading-tight tracking-tight">
                        FinTrack
                    </h2>
                </div>

                <div className="flex flex-1 justify-end items-center gap-6">
                    <nav className="hidden md:flex gap-6 text-sm font-medium text-slate-500 dark:text-slate-400">
                        {navLinks.map((link) => {
                            const isActive = pathname === link.href;
                            return (
                                <Link
                                    key={link.name}
                                    href={link.href}
                                    className={`transition-colors ${isActive
                                        ? "text-primary hover:text-primary"
                                        : "hover:text-slate-900 dark:hover:text-white"
                                        }`}
                                >
                                    {link.name}
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="h-6 w-px bg-border-light dark:bg-border-dark mx-2 hidden md:block"></div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="hidden sm:flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-[20px]">add</span>
                            <span className="truncate">Adicionar Patrimônio</span>
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

                        <button className="flex size-10 items-center justify-center rounded-full bg-border text-foreground hover:text-primary transition-colors cursor-pointer relative">
                            <span className="material-symbols-outlined">notifications</span>
                            <span className="absolute top-2.5 right-2.5 size-2 rounded-full bg-red-500 border border-surface"></span>
                        </button>

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
                <AddAssetModal onClose={() => setIsModalOpen(false)} />
            )}
        </>
    );
}
