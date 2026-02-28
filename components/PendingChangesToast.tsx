"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/lib/i18n";
import { loadPendingData, clearPendingData } from "@/lib/pending-storage";

const TOAST_DURATION_MS = 5000;
const ANIM_DURATION_MS = 350;
const COOLDOWN_MS = 60000; // 1 minuto antes de mostrar novamente

export default function PendingChangesToast() {
    const { t } = useTranslation();
    const pathname = usePathname();
    const [visible, setVisible] = useState(false);
    const [exiting, setExiting] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastHiddenAtRef = useRef<number | null>(null);
    const isShowingRef = useRef(false);
    const isExitingRef = useRef(false);

    const hideToast = () => {
        isExitingRef.current = true;
        setExiting(true);
        lastHiddenAtRef.current = Date.now();
        isShowingRef.current = false;
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        setTimeout(() => {
            setVisible(false);
            setExiting(false);
            isExitingRef.current = false;
        }, ANIM_DURATION_MS);
    };

    useEffect(() => {
        const hasPending = loadPendingData();
        if (hasPending && hasPending.length > 0 && !isExitingRef.current) {
            const now = Date.now();
            const cooldownPassed =
                lastHiddenAtRef.current === null ||
                now - lastHiddenAtRef.current >= COOLDOWN_MS;

            if (cooldownPassed) {
                setVisible(true);
                setExiting(false);

                if (!isShowingRef.current) {
                    isShowingRef.current = true;
                    if (timerRef.current) clearTimeout(timerRef.current);
                    timerRef.current = setTimeout(hideToast, TOAST_DURATION_MS);
                }
            }
        }
    }, [pathname]);

    useEffect(() => {
        const handleSaved = () => {
            clearPendingData();
            hideToast();
        };
        window.addEventListener("pending-saved", handleSaved);
        return () => window.removeEventListener("pending-saved", handleSaved);
    }, []);

    if (!visible) return null;

    return (
        <div
            role="status"
            aria-live="polite"
            className="fixed bottom-6 left-1/2 z-50 flex flex-col rounded-lg bg-surface border border-border shadow-lg overflow-hidden"
            style={
                exiting
                    ? { animation: "pending-toast-exit 0.35s ease-in forwards" }
                    : { animation: "pending-toast-enter 0.35s ease-out both" }
            }
        >
            <div className="flex items-center gap-2 px-4 py-3 pr-2">
                <span className="material-symbols-outlined text-amber-500 text-[20px] shrink-0">info</span>
                <span className="text-sm text-slate-600 dark:text-slate-400 flex-1">
                    {t("toast.pendingChanges")}
                </span>
                <button
                    type="button"
                    onClick={hideToast}
                    className="p-1 rounded hover:bg-border text-slate-400 hover:text-foreground transition-colors cursor-pointer shrink-0"
                    aria-label={t("toast.close")}
                >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
            </div>
            <div className="h-1 bg-border overflow-hidden rounded-b-lg">
                <div
                    className="toast-timer-bar h-full w-full bg-primary/60"
                    style={{ animation: "toast-timer-shrink 5s linear forwards" }}
                />
            </div>
        </div>
    );
}
