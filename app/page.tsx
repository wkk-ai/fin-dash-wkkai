"use client";

import { useEffect, useState } from "react";
import { AssetEntry } from "@/types/database";
import { useTranslation } from "@/lib/i18n";
import { parseCustomDate, pickMonthlySnapshotDates } from "@/lib/utils";
import DashboardSection from "@/components/DashboardSection";
import ProjectionsSection from "@/components/ProjectionsSection";
import { fetchNetWorth } from "@/lib/supabase-data";

export default function Home() {
  const { t } = useTranslation();
  const [data, setData] = useState<AssetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthlyAddition, setMonthlyAddition] = useState<string>("1000");
  const [annualRate, setAnnualRate] = useState<string>("10");
  const [yearsToProject, setYearsToProject] = useState<string>("10");
  const [suggestedAddition, setSuggestedAddition] = useState<number>(1000);

  const fetchData = async () => {
    try {
      const dbData = await fetchNetWorth();
      setData(dbData);

      // Default contribution = monthly wealth variation (same as dashboard MoM)
      const uniqueDates = pickMonthlySnapshotDates(Array.from(new Set(dbData.map((d) => d.Date))));
      const dateValues: Record<string, number> = {};
      dbData.forEach((d) => { dateValues[d.Date] = (dateValues[d.Date] || 0) + d.Value; });
      const latestDateStr = uniqueDates[uniqueDates.length - 1];
      const prevDateStr = uniqueDates.length > 1 ? uniqueDates[uniqueDates.length - 2] : null;
      const currentWealth = dateValues[latestDateStr] || 0;
      const prevWealth = prevDateStr ? dateValues[prevDateStr] : 0;
      const vnw = currentWealth - prevWealth;
      const suggestion = uniqueDates.length > 1 ? Math.round(vnw) : 1000;

      setSuggestedAddition(suggestion);
      setMonthlyAddition(String(suggestion));
      setLoading(false);
    } catch (err) {
      console.error("Failed to load data", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const handleAdd = () => fetchData();
    window.addEventListener("asset-added", handleAdd);
    return () => window.removeEventListener("asset-added", handleAdd);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!data?.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 px-6 text-center">
        <span className="material-symbols-outlined text-[40px] text-slate-400">account_balance_wallet</span>
        <div className="space-y-1 max-w-sm">
          <p className="text-base font-bold text-foreground">{t("home.noDataTitle")}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("home.noDataDesc")}</p>
        </div>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("open-new-entry", { detail: { startAt: "intent" } }))}
          className="mt-1 px-5 py-2.5 rounded-lg text-sm font-bold text-white bg-primary hover:bg-primary/90 shadow-sm transition-colors"
        >
          {t("home.addFirst")}
        </button>
      </div>
    );
  }

  // Build date aggregates — one point per calendar month (fixes mid-month MoM)
  const uniqueDates = pickMonthlySnapshotDates(Array.from(new Set(data.map((d) => d.Date))));

  const dateValues: Record<string, number> = {};
  data.forEach((d) => {
    dateValues[d.Date] = (dateValues[d.Date] || 0) + d.Value;
  });

  const dateObjects: Record<string, Date> = {};
  uniqueDates.forEach((dateStr) => {
    dateObjects[dateStr] = parseCustomDate(dateStr);
  });

  const latestDateStr = uniqueDates[uniqueDates.length - 1];
  const currentWealth = dateValues[latestDateStr] || 0;

  const months = Number(yearsToProject) * 12;
  const monthlyRate = Math.pow(1 + Number(annualRate) / 100, 1 / 12) - 1;
  const addition = Number(monthlyAddition);

  let simulatedWealth = currentWealth;
  for (let i = 1; i <= months; i++) {
    simulatedWealth = simulatedWealth * (1 + monthlyRate) + addition;
  }

  return (
    <div className="space-y-16 pb-20">
      {/* Dashboard Section */}
      <section id="dashboard" className="animate-in fade-in slide-in-from-bottom-4 duration-700">
        <DashboardSection
          data={data}
          uniqueDates={uniqueDates}
          dateValues={dateValues}
          dateObjects={dateObjects}
          projectionResult={simulatedWealth}
          projectionParams={{
            monthlyAddition: addition,
            annualRate: Number(annualRate),
            years: Number(yearsToProject)
          }}
        />
      </section>

      {/* Divider */}
      <div className="h-px bg-border max-w-7xl mx-auto" />

      {/* Projections Section */}
      <section id="projections" className="animate-in fade-in slide-in-from-bottom-8 duration-1000">
        <ProjectionsSection
          currentWealth={currentWealth}
          params={{ monthlyAddition, annualRate, yearsToProject }}
          setParams={{ setMonthlyAddition, setAnnualRate, setYearsToProject }}
          suggestedAddition={suggestedAddition}
        />
      </section>
    </div>
  );
}
