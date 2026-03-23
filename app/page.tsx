"use client";

import { useEffect, useState } from "react";
import { AssetEntry } from "@/types/database";
import { useTranslation } from "@/lib/i18n";
import { parseCustomDate } from "@/lib/utils";
import DashboardSection from "@/components/DashboardSection";
import ProjectionsSection from "@/components/ProjectionsSection";
import { fetchNetWorth, fetchMovements } from "@/lib/supabase-data";

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

      const { movements } = await fetchMovements();


      // --- 1. Calculate suggested contribution ---
      
      // A. Remaining Budget (OR)
      const movementDates = movements.map((m: any) => parseCustomDate(m.Date)).filter((d: any) => !isNaN(d.getTime()));
      let or = 0;
      if (movementDates.length > 0) {
        const latestMvDate = new Date(Math.max(...movementDates.map((d: any) => d.getTime())));
        const currentMonth = latestMvDate.toLocaleString('en-US', { month: 'short' });
        const currentYear = String(latestMvDate.getFullYear()).slice(-2);

        const matchMonth = (dateStr: string, m: string, y: string) => {
          const parts = dateStr.split('/');
          const monthPart = parts[1]?.replace(".", "")?.toLowerCase() || "";
          const targetMonth = m.toLowerCase().replace(".", "");
          return monthPart === targetMonth && parts[2] === y;
        };

        const currentMovements = movements.filter((m: any) => matchMonth(m.Date, currentMonth, currentYear));
        const income = currentMovements.filter((m: any) => m.Type === "Income").reduce((acc: number, m: any) => acc + m.Value, 0);
        const expenses = Math.abs(currentMovements.filter((m: any) => m.Type === "Expense").reduce((acc: number, m: any) => acc + m.Value, 0));
        or = income - expenses;
      }

      // B. Net Worth Variation (VNW)
      const uniqueDates = Array.from(new Set(dbData.map((d) => d.Date)));
      uniqueDates.sort((a, b) => parseCustomDate(a).getTime() - parseCustomDate(b).getTime());
      const dateValues: Record<string, number> = {};
      dbData.forEach((d) => { dateValues[d.Date] = (dateValues[d.Date] || 0) + d.Value; });
      const latestDateStr = uniqueDates[uniqueDates.length - 1];
      const prevDateStr = uniqueDates.length > 1 ? uniqueDates[uniqueDates.length - 2] : null;
      const currentWealth = dateValues[latestDateStr] || 0;
      const prevWealth = prevDateStr ? dateValues[prevDateStr] : 0;
      const vnw = currentWealth - prevWealth;

      // C. Decision Matrix
      let suggestion = 1000;
      if (or < 0) {
        suggestion = 1000;
      } else if (vnw < 0) {
        suggestion = or;
      } else {
        suggestion = vnw - or;
      }
      
      setSuggestedAddition(suggestion);
      setMonthlyAddition(String(Math.round(suggestion)));
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
          suggestedAddition={suggestedAddition}
        />
      </section>
    </div>
  );
}
