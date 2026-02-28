"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import messagesPtBR from "@/messages/pt-BR.json";
import messagesEnUS from "@/messages/en-US.json";
import messagesEsES from "@/messages/es-ES.json";

export type LangCode = "BRA" | "ENG" | "SPA";
export type Locale = "pt-BR" | "en-US" | "es-ES";

const MESSAGES: Record<Locale, Record<string, unknown>> = {
    "pt-BR": messagesPtBR as Record<string, unknown>,
    "en-US": messagesEnUS as Record<string, unknown>,
    "es-ES": messagesEsES as Record<string, unknown>,
};

const LANG_TO_LOCALE: Record<LangCode, Locale> = {
    BRA: "pt-BR",
    ENG: "en-US",
    SPA: "es-ES",
};

const LANG_KEY = "fin-track-lang";
const DEFAULT: LangCode = "BRA";

const LANGS: { code: LangCode; flag: string; locale: Locale }[] = [
    { code: "BRA", flag: "🇧🇷", locale: "pt-BR" },
    { code: "ENG", flag: "🇺🇸", locale: "en-US" },
    { code: "SPA", flag: "🇪🇸", locale: "es-ES" },
];

type Messages = Record<string, unknown>;
type ContextValue = {
    lang: LangCode;
    locale: Locale;
    setLang: (l: LangCode) => void;
    langs: typeof LANGS;
    messages: Messages;
};

const Ctx = createContext<ContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [lang, setLangState] = useState<LangCode>(DEFAULT);
    const [messages, setMessages] = useState<Messages>(() => MESSAGES["pt-BR"]);

    const locale = LANG_TO_LOCALE[lang];

    useEffect(() => {
        const s = localStorage.getItem(LANG_KEY) as LangCode | null;
        if (s && ["BRA", "ENG", "SPA"].includes(s)) setLangState(s);
    }, []);

    useEffect(() => {
        setMessages(MESSAGES[locale]);
    }, [locale]);

    useEffect(() => {
        document.documentElement.lang = locale === "pt-BR" ? "pt-BR" : locale === "es-ES" ? "es" : "en";
    }, [locale]);

    const setLang = useCallback((l: LangCode) => {
        setLangState(l);
        if (typeof window !== "undefined") localStorage.setItem(LANG_KEY, l);
    }, []);

    return (
        <Ctx.Provider value={{ lang, locale, setLang, langs: LANGS, messages }}>
            {children}
        </Ctx.Provider>
    );
}

export function useLanguage() {
    const c = useContext(Ctx);
    if (!c) throw new Error("useLanguage must be used within LanguageProvider");
    return c;
}
