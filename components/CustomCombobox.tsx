"use client";

import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";

interface Props {
    options: string[];
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
    className?: string;
    required?: boolean;
    disabled?: boolean;
}

export function CustomCombobox({
    options,
    value,
    onChange,
    placeholder = "Adicionar ou escolher...",
    className = "",
    required = false,
    disabled = false,
}: Props) {
    const [isOpen, setIsOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [coords, setCoords] = useState<{
        top: number;
        left: number;
        width: number;
        maxHeight: number;
        openUp: boolean;
    } | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    const updatePosition = () => {
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom - 12;
        const spaceAbove = rect.top - 12;
        const preferred = 240;
        const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
        const maxHeight = Math.max(120, Math.min(preferred, openUp ? spaceAbove : spaceBelow));
        setCoords({
            top: openUp ? rect.top - 4 : rect.bottom + 4,
            left: rect.left,
            width: rect.width,
            maxHeight,
            openUp,
        });
    };

    useLayoutEffect(() => {
        if (!isOpen) return;
        updatePosition();
        const onScrollOrResize = () => updatePosition();
        window.addEventListener("resize", onScrollOrResize);
        // capture scroll on any scrollable ancestor (modal body)
        window.addEventListener("scroll", onScrollOrResize, true);
        return () => {
            window.removeEventListener("resize", onScrollOrResize);
            window.removeEventListener("scroll", onScrollOrResize, true);
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            const inTrigger = containerRef.current?.contains(target);
            const inList = listRef.current?.contains(target);
            if (!inTrigger && !inList) setIsOpen(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen]);

    const filtered = options.filter((option) =>
        !value || option.toLowerCase().includes(value.toLowerCase()) || option === value
    );
    // Always show full list when value exactly matches an option (user selected)
    const listOptions =
        value && options.includes(value) ? options : filtered.length > 0 ? filtered : options;

    const handleSelect = (option: string) => {
        onChange(option);
        setIsOpen(false);
        inputRef.current?.focus();
    };

    const list =
        mounted && isOpen && listOptions.length > 0 && coords
            ? createPortal(
                  <ul
                      ref={listRef}
                      style={{
                          position: "fixed",
                          top: coords.openUp ? undefined : coords.top,
                          bottom: coords.openUp
                              ? window.innerHeight - coords.top
                              : undefined,
                          left: coords.left,
                          width: coords.width,
                          maxHeight: coords.maxHeight,
                          zIndex: 9999,
                      }}
                      className="overflow-auto rounded-lg bg-surface border border-border shadow-xl py-1 text-sm text-foreground"
                  >
                      {listOptions.map((option, index) => (
                          <li
                              key={`${option}-${index}`}
                              onMouseDown={(e) => {
                                  e.preventDefault();
                              }}
                              onClick={() => handleSelect(option)}
                              className={`px-3 py-2 cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors ${
                                  value === option ? "bg-primary/10 text-primary font-medium" : ""
                              }`}
                          >
                              {option}
                          </li>
                      ))}
                  </ul>,
                  document.body
              )
            : null;

    return (
        <div className="relative w-full" ref={containerRef}>
            <div className="relative flex items-center">
                <input
                    ref={inputRef}
                    type="text"
                    value={value}
                    onChange={(e) => {
                        onChange(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                    placeholder={placeholder}
                    className={`${className} pr-10`}
                    required={required}
                    disabled={disabled}
                    autoComplete="off"
                />
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                        inputRef.current?.focus();
                        setIsOpen(!isOpen);
                    }}
                    className="absolute right-0 top-0 bottom-0 px-3 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                    tabIndex={-1}
                >
                    <span className="material-symbols-outlined text-[18px]">
                        {isOpen ? "expand_less" : "expand_more"}
                    </span>
                </button>
            </div>
            {list}
        </div>
    );
}
