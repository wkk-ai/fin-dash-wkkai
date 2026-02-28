"use client";

import { useState, useRef, useEffect } from "react";
import { useLanguage, type LangCode } from "@/lib/language-context";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export default function LanguageSelector() {
    const { t } = useTranslation();
    const { lang, setLang, langs } = useLanguage();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const h = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        if (open) document.addEventListener("click", h);
        return () => document.removeEventListener("click", h);
    }, [open]);

    const current = langs.find((l) => l.code === lang) ?? langs[0];

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="flex size-10 items-center justify-center rounded-full bg-border text-foreground hover:text-primary transition-colors cursor-pointer text-2xl"
                aria-label={t("nav.selectLanguage")}
                aria-expanded={open}
            >
                {current.flag}
            </button>
            {open && (
                <div className="absolute right-0 top-full mt-2 w-32 rounded-lg border border-border bg-surface shadow-lg py-1 z-50">
                    {langs.map(({ code, flag }) => (
                        <button
                            key={code}
                            type="button"
                            onClick={() => {
                                setLang(code as LangCode);
                                setOpen(false);
                            }}
                            className={cn(
                                "flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors",
                                lang === code
                                    ? "text-primary bg-primary/10"
                                    : "text-slate-600 dark:text-slate-400 hover:bg-border hover:text-foreground"
                            )}
                        >
                            <span className="text-xl">{flag}</span>
                            <span>{code}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
