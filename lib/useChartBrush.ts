"use client";

import { useState, useCallback } from "react";

export type ChartBrushDatum = { name: string; [key: string]: unknown };

export function useChartBrush<T extends ChartBrushDatum>(
    data: T[],
    valueKey: string = "value"
): {
    isDragging: boolean;
    startIndex: number | null;
    endIndex: number | null;
    variation: { absolute: number; percent: number } | null;
    start: (index: number | null) => void;
    update: (index: number | null) => void;
    end: () => void;
} {
    const [isDragging, setIsDragging] = useState(false);
    const [anchorIndex, setAnchorIndex] = useState<number | null>(null);
    const [currentIndex, setCurrentIndex] = useState<number | null>(null);

    const start = useCallback((index: number | null) => {
        if (index === null) return;
        setIsDragging(true);
        setAnchorIndex(index);
        setCurrentIndex(index);
    }, []);

    const update = useCallback((index: number | null) => {
        if (!isDragging || index === null) return;
        setCurrentIndex(index);
    }, [isDragging]);

    const end = useCallback(() => {
        setIsDragging(false);
        setAnchorIndex(null);
        setCurrentIndex(null);
    }, []);

    const hasRange = anchorIndex !== null && currentIndex !== null;
    const startIndex = hasRange ? Math.min(anchorIndex!, currentIndex!) : null;
    const endIndex = hasRange ? Math.max(anchorIndex!, currentIndex!) : null;

    let variation: { absolute: number; percent: number } | null = null;
    if (hasRange && data[anchorIndex!] && data[currentIndex!]) {
        const vClick = Number((data[anchorIndex!] as Record<string, unknown>)[valueKey]) || 0;
        const vDrag = Number((data[currentIndex!] as Record<string, unknown>)[valueKey]) || 0;
        const absolute = vDrag - vClick;
        const percent = vClick !== 0 ? (absolute / vClick) * 100 : (vDrag !== 0 ? 100 : 0);
        variation = { absolute, percent };
    }

    return {
        isDragging,
        startIndex,
        endIndex,
        variation,
        start,
        update,
        end,
    };
}
