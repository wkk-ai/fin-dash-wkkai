"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/lib/i18n";

const TOAST_DURATION_MS = 5000;
const ANIM_DURATION_MS = 300;

export default function AddAssetSuccessToast() {
    const { t } = useTranslation();
    const [visible, setVisible] = useState(false);
    const [exiting, setExiting] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const hideToast = () => {
        setExiting(true);
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        setTimeout(() => {
            setVisible(false);
            setExiting(false);
        }, ANIM_DURATION_MS);
    };

    useEffect(() => {
        const handleShow = () => {
            setVisible(true);
            setExiting(false);
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(hideToast, TOAST_DURATION_MS);
        };

        window.addEventListener("asset-added-success", handleShow);
        return () => {
            window.removeEventListener("asset-added-success", handleShow);
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    if (!visible) return null;

    return (
        <div
            role="status"
            aria-live="polite"
            className="fixed bottom-6 left-1/2 z-50 flex flex-col rounded-lg bg-surface border border-border shadow-lg overflow-hidden"
            style={
                exiting
                    ? { animation: "pending-toast-exit 0.3s ease-in forwards" }
                    : { animation: "pending-toast-enter 0.3s ease-out both" }
            }
        >
            <div className="flex items-center gap-2 px-4 py-3 pr-2">
                <span className="material-symbols-outlined text-green-500 text-[20px] shrink-0">check_circle</span>
                <span className="text-sm text-slate-700 dark:text-slate-300 flex-1">
                    {t("toast.assetAddedSuccess")}
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
                    className="toast-timer-bar h-full w-full bg-green-500/70"
                    style={{ animation: "toast-timer-shrink 5s linear forwards" }}
                />
            </div>
        </div>
    );
}
