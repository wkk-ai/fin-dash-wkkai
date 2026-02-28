"use client";

import { useEffect, useState } from "react";
import { AssetEntry } from "@/types/database";
import { useTranslation } from "@/lib/i18n";
import { parseCustomDate } from "@/lib/utils";
import DashboardSection from "@/components/DashboardSection";
import ProjectionsSection from "@/components/ProjectionsSection";

export default function Home() {
  const { t } = useTranslation();
  const [data, setData] = useState<AssetEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // --- Projection Logic (Lifted) ---
  const [monthlyAddition, setMonthlyAddition] = useState<string>("5000");
  const [annualRate, setAnnualRate] = useState<string>("10");
  const [yearsToProject, setYearsToProject] = useState<string>("10");

  const fetchData = () => {
    fetch("/api/database", { cache: "no-store" })
      .then((res) => res.json())
      .then((json: AssetEntry[]) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load data", err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchData();

    // Handle updates from AddAssetModal (client-side event)
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
    return <div className="text-center py-20 text-slate-500 font-medium">{t("home.noData")}</div>;
  }

  // Build date aggregates from data
  const uniqueDates = Array.from(new Set(data.map((d) => d.Date)));
  uniqueDates.sort((a, b) => parseCustomDate(a).getTime() - parseCustomDate(b).getTime());

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
        />
      </section>
    </div>
  );
}
