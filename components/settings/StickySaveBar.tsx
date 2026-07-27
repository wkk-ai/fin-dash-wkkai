"use client";

import { cn } from "@/lib/utils";

interface StickySaveBarProps {
    visible: boolean;
    message: string;
    saveLabel: string;
    saving: boolean;
    onSave: () => void;
    previewLabel?: string;
    onPreview?: () => void;
}

export function StickySaveBar({
    visible,
    message,
    saveLabel,
    saving,
    onSave,
    previewLabel,
    onPreview,
}: StickySaveBarProps) {
    if (!visible) return null;

    return (
        <div
            className={cn(
                "fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-xl",
                "animate-in slide-in-from-bottom-4 fade-in duration-300"
            )}
        >
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface/95 backdrop-blur-md shadow-lg px-4 py-3">
                <p className="text-sm font-medium text-foreground truncate min-w-0">{message}</p>
                <div className="flex items-center gap-2 shrink-0">
                    {previewLabel && onPreview && (
                        <button
                            type="button"
                            onClick={onPreview}
                            disabled={saving}
                            className="px-3 py-2 rounded-lg text-sm font-bold text-foreground border border-border hover:bg-border transition-colors disabled:opacity-50"
                        >
                            {previewLabel}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onSave}
                        disabled={saving}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white bg-primary hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                        <span className={cn("material-symbols-outlined text-[18px]", saving && "animate-pulse")}>
                            save
                        </span>
                        {saveLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
