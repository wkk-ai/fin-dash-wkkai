"use client";

import { useEffect } from "react";
import { useTranslation } from "@/lib/i18n";

export default function DocumentTitle() {
    const { t } = useTranslation();
    useEffect(() => {
        document.title = `${t("app.title")} | FinTrack`;
    }, [t]);
    return null;
}
