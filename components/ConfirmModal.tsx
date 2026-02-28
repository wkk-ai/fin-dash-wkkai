"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
    variant?: "danger" | "primary";
}

export function ConfirmModal({
    isOpen,
    title,
    message,
    confirmLabel,
    cancelLabel,
    onConfirm,
    onCancel,
    variant = "primary",
}: ConfirmModalProps) {
    const { t } = useTranslation();
    const [mounted, setMounted] = useState(false);
    const finalConfirm = confirmLabel ?? t("common.confirm");
    const finalCancel = cancelLabel ?? t("common.cancel");

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted || !isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-background/60 backdrop-blur-sm animate-in fade-in duration-300"
                onClick={onCancel}
            />

            {/* Modal Content */}
            <div className="relative w-full max-w-sm rounded-2xl bg-surface border border-border shadow-2xl p-6 animate-in zoom-in-95 duration-200">
                <h3 className="text-xl font-bold text-foreground mb-2">{title}</h3>
                <p className="text-sm text-slate-700 dark:text-slate-300 mb-6">{message}</p>

                <div className="flex gap-3 justify-end">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 rounded-lg text-sm font-bold text-foreground hover:bg-border transition-colors cursor-pointer"
                    >
                        {finalCancel}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className={cn(
                            "px-4 py-2 rounded-lg text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90 cursor-pointer",
                            variant === "danger" ? "bg-red-500" : "bg-primary"
                        )}
                    >
                        {finalConfirm}
                    </button>
                </div>
            </div>
        </div>
    );
}
