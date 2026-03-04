"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";

export default function Template({ children }: { children: ReactNode }) {
    const pathname = usePathname();

    return (
        <div className="page-transition min-h-full flex flex-col">
            {children}
        </div>
    );
}
