"use client";

import { ReactNode } from "react";

export default function Template({ children }: { children: ReactNode }) {
    return (
        <div className="page-transition min-h-full flex flex-col">
            {children}
        </div>
    );
}
