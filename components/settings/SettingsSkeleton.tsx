"use client";

export function SettingsSkeleton() {
    return (
        <div className="w-full flex flex-col gap-8 pb-20 animate-pulse">
            <div className="space-y-2">
                <div className="h-9 w-56 rounded-lg bg-slate-200 dark:bg-slate-800" />
                <div className="h-4 w-80 max-w-full rounded bg-slate-100 dark:bg-slate-800/70" />
            </div>

            <div className="flex gap-2 border-b border-border pb-px">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-11 w-24 rounded-t-lg bg-slate-100 dark:bg-slate-800/70 shrink-0" />
                ))}
            </div>

            <div className="flex flex-col gap-6">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div
                        key={i}
                        className="rounded-xl bg-surface border border-border shadow-sm p-6 flex flex-col gap-4"
                    >
                        <div className="flex items-center gap-2 border-b border-border pb-4">
                            <div className="size-6 rounded bg-slate-200 dark:bg-slate-800" />
                            <div className="h-5 w-36 rounded bg-slate-200 dark:bg-slate-800" />
                        </div>
                        <div className="h-9 w-full rounded-lg bg-slate-100 dark:bg-slate-800/70" />
                        <div className="flex flex-wrap gap-2">
                            {Array.from({ length: 4 }).map((_, j) => (
                                <div key={j} className="h-7 w-20 rounded-full bg-slate-100 dark:bg-slate-800/70" />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
