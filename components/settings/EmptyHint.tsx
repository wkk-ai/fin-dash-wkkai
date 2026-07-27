"use client";

interface EmptyHintProps {
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
}

export function EmptyHint({ title, description, actionLabel, onAction }: EmptyHintProps) {
    return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-background/50 px-6 py-10 text-center">
            <span className="material-symbols-outlined text-[32px] text-slate-400">inbox</span>
            <div className="space-y-1 max-w-sm">
                <p className="text-sm font-bold text-foreground">{title}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>
            </div>
            {actionLabel && onAction && (
                <button
                    type="button"
                    onClick={onAction}
                    className="mt-1 px-4 py-2 rounded-lg text-sm font-bold text-primary border border-primary/30 hover:bg-primary/10 transition-colors"
                >
                    {actionLabel}
                </button>
            )}
        </div>
    );
}
