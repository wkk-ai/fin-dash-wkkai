"use client";

import { useState, useCallback, useRef, useEffect } from "react";

/** Recharts 3 reports the hovered point as a string ("12"); older versions as a number. */
function toIndex(raw: unknown, length: number): number | null {
    if (raw === null || raw === undefined || raw === "") return null;
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isInteger(n) && n >= 0 && n < length ? n : null;
}

/**
 * Click and drag on a chart to see the change between the point where the drag
 * started (the reference) and the point under the mouse. Dragging left gives
 * the change from the earlier point to the reference read backwards: the
 * reference is always the start of the drag.
 */
export function useChartBrush<T>(data: T[], valueKey: keyof T, labelKey?: keyof T) {
    const [startIndex, setStartIndex] = useState<number | null>(null);
    const [endIndex, setEndIndex] = useState<number | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    // Active index currently hovered inside Recharts wrapper
    const [activeIndex, setActiveIndex] = useState<number | null>(null);

    useEffect(() => {
        const handleMouseUp = () => {
            if (isDragging) {
                setIsDragging(false);
                setStartIndex(null);
                setEndIndex(null);
            }
        };
        window.addEventListener("mouseup", handleMouseUp);
        return () => window.removeEventListener("mouseup", handleMouseUp);
    }, [isDragging]);

    const onMouseDown = useCallback(() => {
        if (activeIndex !== null) {
            setIsDragging(true);
            setStartIndex(activeIndex);
            setEndIndex(activeIndex);
        }
    }, [activeIndex]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onMouseMove = useCallback((state: any) => {
        const idx = toIndex(state?.activeTooltipIndex ?? state?.activeIndex, data.length);
        if (idx !== null) {
            setActiveIndex(idx);
            if (isDragging) {
                setEndIndex(idx);
            }
        } else {
            setActiveIndex(null);
        }
    }, [isDragging, data.length]);

    const onMouseUp = useCallback(() => {
        setIsDragging(false);
        setStartIndex(null);
        setEndIndex(null);
    }, []);

    const onMouseLeave = useCallback(() => {
        setActiveIndex(null);
    }, []);

    let variation: { absolute: number; percent: number; fromLabel: string; toLabel: string } | null = null;
    let selectionBounds: [number, number] | null = null;

    if (isDragging && startIndex !== null && endIndex !== null && startIndex !== endIndex) {
        selectionBounds = [Math.min(startIndex, endIndex), Math.max(startIndex, endIndex)];

        const refValue = Number(data[startIndex][valueKey]) || 0;
        const currValue = Number(data[endIndex][valueKey]) || 0;
        const absolute = currValue - refValue;
        const percent = refValue !== 0 ? (absolute / refValue) * 100 : 0;

        const label = (i: number) => (labelKey ? String(data[i][labelKey] ?? "") : "");
        variation = { absolute, percent, fromLabel: label(startIndex), toLabel: label(endIndex) };
    }

    return {
        // We bind Down/Up explicitly to the container div, but Move/Leave to the Chart for activeToolipIndex
        containerHandlers: {
            onMouseDown,
        },
        chartHandlers: {
            onMouseMove,
            onMouseLeave,
            onMouseUp,
        },
        isDragging,
        selectionBounds,
        variation,
        activeIndex,
    };
}
