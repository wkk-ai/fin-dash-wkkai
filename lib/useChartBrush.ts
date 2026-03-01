"use client";

import { useState, useCallback, useRef, useEffect } from "react";

export function useChartBrush<T>(data: T[], valueKey: keyof T) {
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

    const onMouseMove = useCallback((state: any) => {
        if (state && typeof state.activeTooltipIndex === "number") {
            setActiveIndex(state.activeTooltipIndex);
            if (isDragging) {
                setEndIndex(state.activeTooltipIndex);
            }
        } else {
            setActiveIndex(null);
        }
    }, [isDragging]);

    const onMouseUp = useCallback(() => {
        setIsDragging(false);
        setStartIndex(null);
        setEndIndex(null);
    }, []);

    const onMouseLeave = useCallback(() => {
        setActiveIndex(null);
    }, []);

    let variation = null;
    let selectionBounds: [number, number] | null = null;

    if (isDragging && startIndex !== null && endIndex !== null && startIndex !== endIndex) {
        selectionBounds = [Math.min(startIndex, endIndex), Math.max(startIndex, endIndex)];

        const refValue = Number(data[startIndex][valueKey]) || 0;
        const currValue = Number(data[endIndex][valueKey]) || 0;
        const absolute = currValue - refValue;
        const percent = refValue !== 0 ? (absolute / refValue) * 100 : 0;

        variation = { absolute, percent };
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
