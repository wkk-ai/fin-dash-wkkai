"use client";

import React, { useState, useRef, useEffect } from "react";

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
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Close when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSelect = (option: string) => {
        onChange(option);
        setIsOpen(false);
        inputRef.current?.focus();
    };

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

            {isOpen && options.length > 0 && (
                <ul className="absolute z-[100] w-full mt-1 max-h-60 overflow-auto rounded-lg bg-surface border border-border shadow-lg py-1 text-sm text-foreground">
                    {options.map((option, index) => (
                        <li
                            key={index}
                            onMouseDown={(e) => {
                                // Prevent input from losing focus immediately before select triggers
                                e.preventDefault();
                            }}
                            onClick={() => handleSelect(option)}
                            className={`px-3 py-2 cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors ${value === option ? "bg-primary/10 text-primary font-medium" : ""
                                }`}
                        >
                            {option}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
