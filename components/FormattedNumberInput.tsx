"use client";

import { useState, useRef, useCallback } from "react";
import { useTheme } from "next-themes";
import { useLanguage } from "@/lib/language-context";
import { formatNumber, parseFormattedNumber, type Locale } from "@/lib/utils";
import { cn } from "@/lib/utils";

const HOLD_DELAY_MS = 400;
const HOLD_INTERVAL_MS = 50;

interface Props {
    value: number;
    onChange: (n: number) => void;
    className?: string;
    placeholder?: string;
    required?: boolean;
    step?: number;
    showSpinner?: boolean;
    compactSpinner?: boolean;
}

export function FormattedNumberInput({ value, onChange, className, placeholder, required, step = 100, showSpinner = true, compactSpinner = false }: Props) {
    const { locale } = useLanguage();
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";
    const [isEditing, setIsEditing] = useState(false);
    const [editStr, setEditStr] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const valueRef = useRef(value);
    const editStrRef = useRef(editStr);
    const isEditingRef = useRef(isEditing);
    valueRef.current = value;
    editStrRef.current = editStr;
    isEditingRef.current = isEditing;

    const display = isEditing
        ? editStr
        : (Number.isNaN(value) || value === 0 ? "" : formatNumber(value, locale as Locale));

    const handleFocus = () => {
        setIsEditing(true);
        setEditStr(value === 0 ? "" : String(value));
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setEditStr(e.target.value);
    };

    const handleBlur = () => {
        const parsed = parseFormattedNumber(editStr, locale as Locale);
        const final = Number.isNaN(parsed) ? 0 : parsed;
        onChange(final);
        setIsEditing(false);
        setEditStr("");
    };

    const spin = useCallback((delta: number) => {
        const base = isEditingRef.current ? (parseFormattedNumber(editStrRef.current, locale as Locale) || 0) : valueRef.current;
        const next = Math.max(0, base + delta);
        valueRef.current = next;
        onChange(next);
        setIsEditing(false);
        setEditStr("");
    }, [locale, onChange]);

    const clearHold = useCallback(() => {
        if (holdTimerRef.current) {
            clearTimeout(holdTimerRef.current);
            holdTimerRef.current = null;
        }
        if (holdIntervalRef.current) {
            clearInterval(holdIntervalRef.current);
            holdIntervalRef.current = null;
        }
    }, []);

    const startHold = useCallback((delta: number) => {
        spin(delta);
        holdTimerRef.current = setTimeout(() => {
            holdTimerRef.current = null;
            holdIntervalRef.current = setInterval(() => spin(delta), HOLD_INTERVAL_MS);
        }, HOLD_DELAY_MS);
    }, [spin]);

    return (
        <div className="relative flex">
            <input
                ref={inputRef}
                type="text"
                inputMode="decimal"
                value={display}
                onFocus={handleFocus}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder={placeholder}
                required={required}
                className={cn(showSpinner && "pr-8", className)}
            />
            {showSpinner && (
                <div className={cn(
                    "absolute right-0 w-8 flex flex-col border-l border-border shrink-0",
                    compactSpinner ? "top-1/2 -translate-y-1/2 h-10 rounded overflow-hidden" : "top-0 bottom-0 rounded-r-lg overflow-hidden"
                )}>
                    <button
                        type="button"
                        tabIndex={-1}
                        onMouseDown={e => { e.preventDefault(); clearHold(); startHold(step); }}
                        onMouseUp={clearHold}
                        onMouseLeave={clearHold}
                        className={cn(
                            "flex items-center justify-center cursor-pointer",
                            isDark ? "bg-slate-800 hover:bg-slate-700 text-slate-400" : "bg-slate-100 hover:bg-slate-200 text-slate-400",
                            compactSpinner ? "h-5" : "flex-1 min-h-[20px]"
                        )}
                    >
                        <span className={cn("material-symbols-outlined", compactSpinner ? "text-[12px]" : "text-[16px]")}>expand_less</span>
                    </button>
                    <button
                        type="button"
                        tabIndex={-1}
                        onMouseDown={e => { e.preventDefault(); clearHold(); startHold(-step); }}
                        onMouseUp={clearHold}
                        onMouseLeave={clearHold}
                        className={cn(
                            "flex items-center justify-center cursor-pointer",
                            isDark ? "bg-slate-800 hover:bg-slate-700 text-slate-400" : "bg-slate-100 hover:bg-slate-200 text-slate-400",
                            compactSpinner ? "h-5" : "flex-1 min-h-[20px]"
                        )}
                    >
                        <span className={cn("material-symbols-outlined", compactSpinner ? "text-[12px]" : "text-[16px]")}>expand_more</span>
                    </button>
                </div>
            )}
        </div>
    );
}
