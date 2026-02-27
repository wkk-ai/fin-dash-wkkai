"use client";

import { useEffect, useState } from "react";
import { AssetEntry } from "@/types/database";
import { parseCustomDate } from "@/lib/utils";
import DashboardSection from "@/components/DashboardSection";
import ProjectionsSection from "@/components/ProjectionsSection";

export default function Home() {
  const [data, setData] = useState<AssetEntry[]>([]);
  const [loading, setLoading] = useState(true);

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
    return <div className="text-center py-20 text-slate-500 font-medium">Nenhum dado encontrado no banco de dados.</div>;
  }

  // --- Data Processing (Centralized) ---
  const dateValues: Record<string, number> = {};
  const dateObjects: Record<string, Date> = {};

  data.forEach((entry) => {
    if (!dateValues[entry.Date]) {
      dateValues[entry.Date] = 0;
      dateObjects[entry.Date] = parseCustomDate(entry.Date);
    }
    dateValues[entry.Date] += entry.Value;
  });

  const uniqueDates = Object.keys(dateValues).sort((a, b) => dateObjects[a].getTime() - dateObjects[b].getTime());
  const latestDateStr = uniqueDates[uniqueDates.length - 1];
  const currentWealth = dateValues[latestDateStr] || 0;

  return (
    <div className="space-y-16 pb-20">
      {/* Dashboard Section */}
      <section id="dashboard" className="animate-in fade-in slide-in-from-bottom-4 duration-700">
        <DashboardSection
          data={data}
          uniqueDates={uniqueDates}
          dateValues={dateValues}
          dateObjects={dateObjects}
        />
      </section>

      {/* Divider */}
      <div className="h-px bg-border max-w-7xl mx-auto" />

      {/* Projections Section */}
      <section id="projections" className="animate-in fade-in slide-in-from-bottom-8 duration-1000">
        <ProjectionsSection currentWealth={currentWealth} />
      </section>
    </div>
  );
}
