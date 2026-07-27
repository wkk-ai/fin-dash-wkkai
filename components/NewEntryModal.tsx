"use client";

import { useEffect, useMemo, useState } from "react";
import { FormattedNumberInput } from "@/components/FormattedNumberInput";
import { CustomCombobox } from "@/components/CustomCombobox";
import { AssetEntry, MovementEntry } from "@/types/database";
import {
  fetchSettings as fetchSettingsData,
  fetchNetWorth,
  appendNetWorth,
  appendNetWorthBatch,
  appendMovement,
} from "@/lib/supabase-data";
import { loadEntryMemory, saveEntryMemory } from "@/lib/entry-memory";
import { useTranslation } from "@/lib/i18n";
import Portal from "./Portal";
import AIImportModal from "./AIImportModal";
import CsvImportPanel from "./new-entry/CsvImportPanel";
import {
  buildAssetRelations,
  inputDateToDbDate,
  latestSnapshotAssets,
  newRowId,
  todayInputDate,
} from "./new-entry/helpers";

interface Props {
  onClose: () => void;
  /** Open directly on a path: ai opens AI import; csv skips to CSV for portfolio */
  startAt?: "intent" | "ai" | "csv-portfolio" | "csv-movement";
}

type Intent = "patrimonio" | "movimentacao";
type PortfolioMode = "update" | "single" | "batch" | "csv";
type MovementMode = "single" | "batch" | "csv";

type AssetDraft = {
  id: string;
  Classification: string;
  Institution: string;
  Asset: string;
  Value: number;
  prevValue?: number;
};

type MovementDraft = {
  id: string;
  Description: string;
  Category: string;
  Value: number;
};

const fieldClass =
  "w-full bg-slate-50 dark:bg-[#0f172a] border-2 border-slate-100 dark:border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white focus:ring-0 focus:border-primary transition-all outline-none";
const labelClass =
  "text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 ml-1";

export default function NewEntryModal({ onClose, startAt = "intent" }: Props) {
  const { formatCurrency } = useTranslation();

  const [step, setStep] = useState<"intent" | "form">(
    startAt === "intent" || startAt === "ai" ? (startAt === "ai" ? "intent" : "intent") : "form"
  );
  const [showAI, setShowAI] = useState(startAt === "ai");
  const [intent, setIntent] = useState<Intent | null>(
    startAt === "csv-portfolio" ? "patrimonio" : startAt === "csv-movement" ? "movimentacao" : null
  );

  const [portfolioMode, setPortfolioMode] = useState<PortfolioMode>(
    startAt === "csv-portfolio" ? "csv" : "update"
  );
  const [movementMode, setMovementMode] = useState<MovementMode>(
    startAt === "csv-movement" ? "csv" : "single"
  );
  const [movimentacaoType, setMovimentacaoType] = useState<"Income" | "Expense">("Expense");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successHint, setSuccessHint] = useState<string | null>(null);

  const [classifications, setClassifications] = useState<string[]>([]);
  const [institutions, setInstitutions] = useState<string[]>([]);
  const [assets, setAssets] = useState<string[]>([]);
  const [incomeCategories, setIncomeCategories] = useState<string[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<string[]>([]);
  const [history, setHistory] = useState<AssetEntry[]>([]);
  const [dataReady, setDataReady] = useState(false);

  const [sharedDate, setSharedDate] = useState(todayInputDate());

  // Single portfolio
  const [singleAsset, setSingleAsset] = useState({
    Classification: "",
    Institution: "",
    Asset: "",
    Value: 0,
  });

  // Update / batch portfolio
  const [assetDrafts, setAssetDrafts] = useState<AssetDraft[]>([]);
  const [lastSnapshotLabel, setLastSnapshotLabel] = useState<string | null>(null);

  // CSV portfolio preview
  const [csvAssets, setCsvAssets] = useState<AssetEntry[]>([]);

  // Single movement
  const [singleMovement, setSingleMovement] = useState({
    Description: "",
    Category: "",
    Value: 0,
  });

  // Batch movements
  const [movementDrafts, setMovementDrafts] = useState<MovementDraft[]>([
    { id: newRowId(), Description: "", Category: "", Value: 0 },
  ]);
  const [csvMovements, setCsvMovements] = useState<MovementEntry[]>([]);

  useEffect(() => {
    if (startAt === "ai") setShowAI(true);
    if (startAt === "csv-portfolio") {
      setIntent("patrimonio");
      setPortfolioMode("csv");
      setStep("form");
    }
    if (startAt === "csv-movement") {
      setIntent("movimentacao");
      setMovementMode("csv");
      setStep("form");
    }
  }, [startAt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !showAI) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, showAI]);

  useEffect(() => {
    Promise.all([fetchSettingsData(), fetchNetWorth()])
      .then(([settings, netWorth]) => {
        const sortedClasses = (settings.classifications || []).sort((a, b) => a.localeCompare(b));
        const sortedInstitutions = (settings.institutions || []).sort((a, b) => a.localeCompare(b));
        const sortedAssets = (settings.assets || []).sort((a, b) => a.localeCompare(b));
        setClassifications(sortedClasses);
        setInstitutions(sortedInstitutions);
        setAssets(sortedAssets);
        setIncomeCategories(settings.incomeCategories || []);
        setExpenseCategories(settings.expenseCategories || []);
        setHistory(netWorth);

        const mem = loadEntryMemory();
        setSingleAsset({
          Classification: mem.classification || "",
          Institution: mem.institution || "",
          Asset: mem.asset || "",
          Value: 0,
        });
        setSingleMovement({
          Description: "",
          Category: mem.categoryExpense || "",
          Value: 0,
        });

        const snap = latestSnapshotAssets(netWorth);
        if (snap) {
          setLastSnapshotLabel(snap.dateStr);
          setAssetDrafts(
            snap.assets.map((a) => ({
              id: newRowId(),
              Classification: a.Classification,
              Institution: a.Institution || a.Asset,
              Asset: a.Asset,
              Value: 0,
              prevValue: a.Value,
            }))
          );
        } else {
          setAssetDrafts([
            {
              id: newRowId(),
              Classification: "",
              Institution: "",
              Asset: "",
              Value: 0,
            },
          ]);
        }
        setDataReady(true);
      })
      .catch(() => {
        setError("Não foi possível carregar suas listas. Tente de novo.");
        setDataReady(true);
      });
  }, []);

  useEffect(() => {
    const cats = movimentacaoType === "Income" ? incomeCategories : expenseCategories;
    const mem = loadEntryMemory();
    const preferred =
      movimentacaoType === "Income" ? mem.categoryIncome : mem.categoryExpense;
    setSingleMovement((prev) => ({
      ...prev,
      Category: preferred && cats.includes(preferred) ? preferred : cats[0] || "",
    }));
    setMovementDrafts((rows) =>
      rows.map((r) => ({
        ...r,
        Category:
          preferred && cats.includes(preferred)
            ? preferred
            : cats.includes(r.Category)
              ? r.Category
              : cats[0] || "",
      }))
    );
  }, [movimentacaoType, incomeCategories, expenseCategories]);

  const relations = useMemo(() => buildAssetRelations(history), [history]);

  const filteredInstitutions = useMemo(() => {
    if (!singleAsset.Classification) return institutions;
    const set = relations.institutionsByClass[singleAsset.Classification];
    if (!set || set.size === 0) return institutions;
    const list = Array.from(set);
    return institutions.filter((i) => list.includes(i)).length
      ? institutions.filter((i) => list.includes(i))
      : institutions;
  }, [singleAsset.Classification, institutions, relations]);

  const filteredAssets = useMemo(() => {
    let pool = assets;
    if (singleAsset.Institution) {
      const set = relations.assetsByInstitution[singleAsset.Institution];
      if (set && set.size > 0) {
        const list = Array.from(set);
        const narrowed = assets.filter((a) => list.includes(a));
        if (narrowed.length) pool = narrowed;
      }
    } else if (singleAsset.Classification) {
      const set = relations.assetsByClass[singleAsset.Classification];
      if (set && set.size > 0) {
        const list = Array.from(set);
        const narrowed = assets.filter((a) => list.includes(a));
        if (narrowed.length) pool = narrowed;
      }
    }
    return pool;
  }, [singleAsset.Institution, singleAsset.Classification, assets, relations]);

  const categories =
    movimentacaoType === "Income" ? incomeCategories : expenseCategories;

  const isPortfolio = intent === "patrimonio";
  const isIncome = movimentacaoType === "Income";
  const accent = isPortfolio
    ? "blue"
    : isIncome
      ? "emerald"
      : "rose";
  const primaryBtn =
    accent === "blue"
      ? "bg-blue-500 hover:bg-blue-600 shadow-blue-500/25"
      : accent === "emerald"
        ? "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/25"
        : "bg-rose-500 hover:bg-rose-600 shadow-rose-500/25";
  const accentText =
    accent === "blue"
      ? "text-blue-500"
      : accent === "emerald"
        ? "text-emerald-500"
        : "text-rose-500";

  const openForm = (next: Intent, mode?: PortfolioMode | MovementMode) => {
    setError(null);
    setSuccessHint(null);
    setIntent(next);
    if (next === "patrimonio") {
      setPortfolioMode((mode as PortfolioMode) || "update");
    } else {
      setMovementMode((mode as MovementMode) || "single");
    }
    setStep("form");
  };

  const resetAfterSave = (keepOpen: boolean) => {
    setError(null);
    setSingleAsset((prev) => ({ ...prev, Value: 0 }));
    setSingleMovement((prev) => ({ ...prev, Description: "", Value: 0 }));
    setCsvAssets([]);
    setCsvMovements([]);
    if (portfolioMode === "update" || portfolioMode === "batch") {
      setAssetDrafts((rows) =>
        rows.map((r) => ({ ...r, Value: 0, id: newRowId() }))
      );
    }
    if (movementMode === "batch") {
      setMovementDrafts([{ id: newRowId(), Description: "", Category: categories[0] || "", Value: 0 }]);
    }
    if (!keepOpen) {
      setSuccessHint(null);
      onClose();
    }
  };

  const rememberPortfolio = (row: { Classification: string; Institution: string; Asset: string }) => {
    saveEntryMemory({
      classification: row.Classification,
      institution: row.Institution,
      asset: row.Asset,
    });
  };

  const rememberCategory = (category: string) => {
    if (movimentacaoType === "Income") saveEntryMemory({ categoryIncome: category });
    else saveEntryMemory({ categoryExpense: category });
  };

  const handleSavePortfolio = async (andAnother: boolean) => {
    setLoading(true);
    setError(null);
    setSuccessHint(null);
    try {
      const dateDb = inputDateToDbDate(sharedDate);

      if (portfolioMode === "single") {
        if (!singleAsset.Asset || !singleAsset.Institution || !singleAsset.Classification) {
          setError("Preencha classificação, instituição e ativo.");
          return;
        }
        if (!singleAsset.Value || singleAsset.Value === 0) {
          setError("Informe o valor.");
          return;
        }
        const row: AssetEntry = {
          Date: dateDb,
          Classification: singleAsset.Classification,
          Institution: singleAsset.Institution,
          Asset: singleAsset.Asset,
          Value: singleAsset.Value,
        };
        await appendNetWorth(row);
        rememberPortfolio(row);
        window.dispatchEvent(new CustomEvent("asset-added-success"));
        window.dispatchEvent(new CustomEvent("asset-added", { detail: row }));
        if (andAnother) {
          setSuccessHint("Salvo. Pode adicionar outro.");
          resetAfterSave(true);
        } else {
          resetAfterSave(false);
        }
        return;
      }

      if (portfolioMode === "csv") {
        if (csvAssets.length === 0) {
          setError("Envie um CSV/JSON válido antes de salvar.");
          return;
        }
        const rows = csvAssets.map((r) => ({ ...r, Date: r.Date || dateDb }));
        await appendNetWorthBatch(rows);
        window.dispatchEvent(new CustomEvent("asset-added-success"));
        window.dispatchEvent(new CustomEvent("asset-added", { detail: rows[0] }));
        resetAfterSave(false);
        return;
      }

      // update or batch
      const rows: AssetEntry[] = assetDrafts
        .filter((r) => r.Value > 0 && r.Asset && r.Institution && r.Classification)
        .map((r) => ({
          Date: dateDb,
          Classification: r.Classification,
          Institution: r.Institution,
          Asset: r.Asset,
          Value: r.Value,
        }));

      if (rows.length === 0) {
        setError(
          portfolioMode === "update"
            ? "Preencha ao menos um valor novo para atualizar o mês."
            : "Adicione ao menos uma linha com valor."
        );
        return;
      }

      await appendNetWorthBatch(rows);
      rememberPortfolio(rows[0]);
      window.dispatchEvent(new CustomEvent("asset-added-success"));
      window.dispatchEvent(new CustomEvent("asset-added", { detail: rows[0] }));
      if (andAnother) {
        setSuccessHint(`${rows.length} salvo(s). Pode continuar.`);
        resetAfterSave(true);
      } else {
        resetAfterSave(false);
      }
    } catch {
      setError("Não foi possível salvar. Tente de novo.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMovement = async (andAnother: boolean) => {
    setLoading(true);
    setError(null);
    setSuccessHint(null);
    try {
      const dateDb = inputDateToDbDate(sharedDate);

      if (movementMode === "csv") {
        if (csvMovements.length === 0) {
          setError("Envie um CSV/JSON válido antes de salvar.");
          return;
        }
        for (const item of csvMovements) {
          await appendMovement({ ...item, Date: item.Date || dateDb });
        }
        window.dispatchEvent(new CustomEvent("movement-added-success"));
        window.dispatchEvent(new CustomEvent("movement-added"));
        resetAfterSave(false);
        return;
      }

      const items: MovementEntry[] =
        movementMode === "single"
          ? [
              {
                Date: dateDb,
                Description: singleMovement.Description.trim(),
                Category: singleMovement.Category,
                Type: movimentacaoType,
                Value: singleMovement.Value,
              },
            ]
          : movementDrafts
              .filter((r) => r.Description.trim() && r.Value !== 0)
              .map((r) => ({
                Date: dateDb,
                Description: r.Description.trim(),
                Category: r.Category,
                Type: movimentacaoType,
                Value: r.Value,
              }));

      if (movementMode === "single") {
        if (!items[0].Description) {
          setError("Informe a descrição.");
          return;
        }
        if (!items[0].Value) {
          setError("Informe o valor.");
          return;
        }
        if (!items[0].Category) {
          setError("Escolha uma categoria.");
          return;
        }
      } else if (items.length === 0) {
        setError("Adicione ao menos uma movimentação com descrição e valor.");
        return;
      }

      for (const item of items) {
        await appendMovement(item);
      }
      rememberCategory(items[0].Category);
      window.dispatchEvent(new CustomEvent("movement-added-success"));
      window.dispatchEvent(new CustomEvent("movement-added"));
      if (andAnother) {
        setSuccessHint("Salvo. Pode adicionar outra.");
        resetAfterSave(true);
      } else {
        resetAfterSave(false);
      }
    } catch {
      setError("Não foi possível salvar. Tente de novo.");
    } finally {
      setLoading(false);
    }
  };

  const fillPrevValues = () => {
    setAssetDrafts((rows) =>
      rows.map((r) => ({
        ...r,
        Value: r.prevValue != null ? r.prevValue : r.Value,
      }))
    );
  };

  const addAssetCard = () => {
    setAssetDrafts((rows) => [
      ...rows,
      {
        id: newRowId(),
        Classification: loadEntryMemory().classification || classifications[0] || "",
        Institution: loadEntryMemory().institution || "",
        Asset: "",
        Value: 0,
      },
    ]);
  };

  const addMovementCard = () => {
    setMovementDrafts((rows) => [
      ...rows,
      {
        id: newRowId(),
        Description: "",
        Category: categories[0] || "",
        Value: 0,
      },
    ]);
  };

  if (showAI) {
    return (
      <AIImportModal
        onClose={() => {
          setShowAI(false);
          if (startAt === "ai") onClose();
        }}
      />
    );
  }

  const title =
    step === "intent"
      ? "Nova entrada"
      : isPortfolio
        ? "Patrimônio"
        : isIncome
          ? "Receita"
          : "Despesa";

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center md:items-center bg-black/50 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className="w-full max-w-lg md:max-w-xl bg-white dark:bg-[#1e293b] rounded-t-3xl md:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in slide-in-from-bottom-4 md:zoom-in-95 duration-200 max-h-[92vh] flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          {/* Header */}
          <div className="px-5 py-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {step === "form" && (
                <button
                  type="button"
                  onClick={() => {
                    setStep("intent");
                    setError(null);
                  }}
                  className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400"
                  aria-label="Voltar"
                >
                  <span className="material-symbols-outlined block">arrow_back</span>
                </button>
              )}
              <h2 className="text-lg font-bold text-slate-800 dark:text-white truncate">{title}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-slate-400"
              aria-label="Fechar"
            >
              <span className="material-symbols-outlined block">close</span>
            </button>
          </div>

          <div className="overflow-y-auto flex-1 p-5 space-y-5">
            {!dataReady && (
              <div className="flex justify-center py-10">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            )}

            {dataReady && step === "intent" && (
              <div className="space-y-3">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  O que você quer fazer?
                </p>
                <button
                  type="button"
                  onClick={() => openForm("patrimonio", "update")}
                  className="w-full flex items-start gap-4 p-4 rounded-2xl border-2 border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10 text-left transition-colors"
                >
                  <span className="material-symbols-outlined text-blue-500 text-3xl">update</span>
                  <div>
                    <p className="font-bold text-foreground">Atualizar patrimônio</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Edite os valores do último mês — fluxo mensal rápido
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => openForm("movimentacao", "single")}
                  className="w-full flex items-start gap-4 p-4 rounded-2xl border-2 border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 text-left transition-colors"
                >
                  <span className="material-symbols-outlined text-rose-500 text-3xl">swap_horiz</span>
                  <div>
                    <p className="font-bold text-foreground">Receita ou despesa</p>
                    <p className="text-xs text-slate-500 mt-0.5">Valor primeiro, poucos toques</p>
                  </div>
                </button>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => openForm("patrimonio", "csv")}
                    className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-border bg-surface hover:border-primary/40 transition-colors"
                  >
                    <span className="material-symbols-outlined text-primary">upload_file</span>
                    <span className="text-xs font-bold text-foreground text-center">
                      CSV patrimônio
                    </span>
                    <span className="text-[10px] text-slate-500 text-center">Financial Reader</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAI(true)}
                    className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-border bg-surface hover:border-primary/40 transition-colors"
                  >
                    <span className="material-symbols-outlined text-primary">auto_awesome</span>
                    <span className="text-xs font-bold text-foreground text-center">Importar com IA</span>
                    <span className="text-[10px] text-slate-500 text-center">PDF / planilha</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => openForm("patrimonio", "single")}
                  className="w-full text-center text-xs font-medium text-slate-500 hover:text-primary py-2"
                >
                  Ou adicionar um ativo novo →
                </button>
              </div>
            )}

            {dataReady && step === "form" && intent === "patrimonio" && (
              <>
                <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#0f172a] overflow-x-auto">
                  {(
                    [
                      ["update", "Atualizar mês"],
                      ["single", "Um ativo"],
                      ["batch", "Vários"],
                      ["csv", "CSV"],
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        setPortfolioMode(mode);
                        setError(null);
                      }}
                      className={`flex-1 min-w-[4.5rem] px-2 py-2 text-[11px] font-bold rounded-lg whitespace-nowrap transition-all ${
                        portfolioMode === mode
                          ? "bg-white dark:bg-slate-800 text-blue-500 shadow-sm"
                          : "text-slate-500"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {portfolioMode !== "csv" && (
                  <div className="space-y-1.5">
                    <label className={labelClass}>Data do snapshot</label>
                    <input
                      type="date"
                      value={sharedDate}
                      onChange={(e) => setSharedDate(e.target.value)}
                      className={fieldClass}
                      required
                    />
                    {lastSnapshotLabel && portfolioMode === "update" && (
                      <p className="text-[11px] text-slate-500">
                        Último registro: {lastSnapshotLabel}. Digite os valores novos abaixo.
                      </p>
                    )}
                  </div>
                )}

                {portfolioMode === "single" && (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className={labelClass}>Valor (R$)</label>
                      <FormattedNumberInput
                        value={singleAsset.Value}
                        onChange={(n) => setSingleAsset((p) => ({ ...p, Value: n }))}
                        placeholder="0,00"
                        className={`${fieldClass} text-2xl font-bold`}
                        showSpinner={false}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className={labelClass}>Ativo</label>
                      <CustomCombobox
                        options={filteredAssets}
                        value={singleAsset.Asset}
                        onChange={(val) => {
                          const guessClass =
                            relations.classByAssetInst[
                              `${singleAsset.Institution}::${val}`
                            ] || singleAsset.Classification;
                          setSingleAsset((p) => ({
                            ...p,
                            Asset: val,
                            Classification: guessClass || p.Classification,
                          }));
                        }}
                        placeholder="Ex: Cofrinhos"
                        className={fieldClass}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className={labelClass}>Instituição</label>
                        <CustomCombobox
                          options={filteredInstitutions}
                          value={singleAsset.Institution}
                          onChange={(val) =>
                            setSingleAsset((p) => ({
                              ...p,
                              Institution: val,
                              Asset:
                                relations.assetsByInstitution[val]?.has(p.Asset) ? p.Asset : "",
                            }))
                          }
                          placeholder="Ex: Nubank"
                          className={fieldClass}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className={labelClass}>Classificação</label>
                        <CustomCombobox
                          options={classifications}
                          value={singleAsset.Classification}
                          onChange={(val) =>
                            setSingleAsset((p) => ({ ...p, Classification: val }))
                          }
                          placeholder="Ex: Renda Fixa"
                          className={fieldClass}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {(portfolioMode === "update" || portfolioMode === "batch") && (
                  <div className="space-y-3">
                    {portfolioMode === "update" && (
                      <button
                        type="button"
                        onClick={fillPrevValues}
                        className="text-xs font-bold text-blue-500 hover:underline"
                      >
                        Copiar valores do mês anterior
                      </button>
                    )}
                    {assetDrafts.map((row) => (
                      <div
                        key={row.id}
                        className="rounded-2xl border border-border bg-slate-50/80 dark:bg-slate-900/40 p-4 space-y-3"
                      >
                        {portfolioMode === "batch" ? (
                          <>
                            <div className="flex justify-between gap-2">
                              <CustomCombobox
                                options={assets}
                                value={row.Asset}
                                onChange={(val) =>
                                  setAssetDrafts((rows) =>
                                    rows.map((r) =>
                                      r.id === row.id ? { ...r, Asset: val } : r
                                    )
                                  )
                                }
                                placeholder="Ativo"
                                className={fieldClass}
                              />
                              {assetDrafts.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setAssetDrafts((rows) => rows.filter((r) => r.id !== row.id))
                                  }
                                  className="text-slate-400 hover:text-red-500 shrink-0"
                                >
                                  <span className="material-symbols-outlined">delete</span>
                                </button>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <CustomCombobox
                                options={institutions}
                                value={row.Institution}
                                onChange={(val) =>
                                  setAssetDrafts((rows) =>
                                    rows.map((r) =>
                                      r.id === row.id ? { ...r, Institution: val } : r
                                    )
                                  )
                                }
                                placeholder="Instituição"
                                className={fieldClass}
                              />
                              <CustomCombobox
                                options={classifications}
                                value={row.Classification}
                                onChange={(val) =>
                                  setAssetDrafts((rows) =>
                                    rows.map((r) =>
                                      r.id === row.id ? { ...r, Classification: val } : r
                                    )
                                  )
                                }
                                placeholder="Classe"
                                className={fieldClass}
                              />
                            </div>
                          </>
                        ) : (
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-bold text-foreground truncate">{row.Asset}</p>
                              <p className="text-xs text-slate-500 truncate">
                                {row.Institution} · {row.Classification}
                              </p>
                              {row.prevValue != null && (
                                <p className="text-[11px] text-slate-400 mt-1">
                                  Antes: {formatCurrency(row.prevValue)}
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                        <FormattedNumberInput
                          value={row.Value}
                          onChange={(n) =>
                            setAssetDrafts((rows) =>
                              rows.map((r) => (r.id === row.id ? { ...r, Value: n } : r))
                            )
                          }
                          placeholder="Novo valor"
                          className={`${fieldClass} font-semibold`}
                          showSpinner={false}
                        />
                      </div>
                    ))}
                    {portfolioMode === "batch" && (
                      <button
                        type="button"
                        onClick={addAssetCard}
                        className={`flex items-center gap-2 text-sm font-bold ${accentText}`}
                      >
                        <span className="material-symbols-outlined text-[18px]">add_circle</span>
                        Adicionar outro
                      </button>
                    )}
                  </div>
                )}

                {portfolioMode === "csv" && (
                  <div className="space-y-4">
                    <CsvImportPanel
                      kind="portfolio"
                      onError={setError}
                      onParsed={(rows) => {
                        setError(null);
                        setCsvAssets(rows);
                        setSuccessHint(`${rows.length} linha(s) pronta(s) para importar.`);
                      }}
                    />
                    {csvAssets.length > 0 && (
                      <div className="max-h-48 overflow-y-auto rounded-xl border border-border divide-y divide-border text-sm">
                        {csvAssets.map((r, i) => (
                          <div key={`${r.Asset}-${i}`} className="px-3 py-2 flex justify-between gap-2">
                            <span className="truncate text-foreground">
                              {r.Asset}
                              <span className="text-slate-400"> · {r.Institution}</span>
                            </span>
                            <span className="font-semibold shrink-0">{formatCurrency(r.Value)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowAI(true)}
                      className="text-xs font-bold text-primary hover:underline"
                    >
                      Prefere importar com IA?
                    </button>
                  </div>
                )}
              </>
            )}

            {dataReady && step === "form" && intent === "movimentacao" && (
              <>
                <div className="p-1 rounded-xl bg-slate-100 dark:bg-[#0f172a] flex border border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setMovimentacaoType("Income")}
                    className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${
                      movimentacaoType === "Income"
                        ? "bg-white dark:bg-slate-800 shadow-md text-emerald-500"
                        : "text-slate-500"
                    }`}
                  >
                    Receita
                  </button>
                  <button
                    type="button"
                    onClick={() => setMovimentacaoType("Expense")}
                    className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${
                      movimentacaoType === "Expense"
                        ? "bg-white dark:bg-slate-800 shadow-md text-rose-500"
                        : "text-slate-500"
                    }`}
                  >
                    Despesa
                  </button>
                </div>

                <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#0f172a]">
                  {(
                    [
                      ["single", "Uma"],
                      ["batch", "Várias"],
                      ["csv", "CSV"],
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        setMovementMode(mode);
                        setError(null);
                      }}
                      className={`flex-1 py-2 text-xs font-bold rounded-lg ${
                        movementMode === mode
                          ? `bg-white dark:bg-slate-800 shadow-sm ${accentText}`
                          : "text-slate-500"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {movementMode !== "csv" && (
                  <div className="space-y-1.5">
                    <label className={labelClass}>Data</label>
                    <input
                      type="date"
                      value={sharedDate}
                      onChange={(e) => setSharedDate(e.target.value)}
                      className={fieldClass}
                    />
                  </div>
                )}

                {movementMode === "single" && (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className={labelClass}>Valor (R$)</label>
                      <FormattedNumberInput
                        value={singleMovement.Value}
                        onChange={(n) => setSingleMovement((p) => ({ ...p, Value: n }))}
                        placeholder="0,00"
                        className={`${fieldClass} text-2xl font-bold`}
                        showSpinner={false}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className={labelClass}>Descrição</label>
                      <input
                        type="text"
                        value={singleMovement.Description}
                        onChange={(e) =>
                          setSingleMovement((p) => ({ ...p, Description: e.target.value }))
                        }
                        placeholder="Ex: Mercado, salário..."
                        className={fieldClass}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className={labelClass}>Categoria</label>
                      <div className="flex flex-wrap gap-2">
                        {categories.map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setSingleMovement((p) => ({ ...p, Category: cat }))}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                              singleMovement.Category === cat
                                ? `${accentText} border-current bg-current/10`
                                : "border-border text-slate-500"
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                      {categories.length === 0 && (
                        <CustomCombobox
                          options={[]}
                          value={singleMovement.Category}
                          onChange={(val) =>
                            setSingleMovement((p) => ({ ...p, Category: val }))
                          }
                          placeholder="Digite a categoria"
                          className={fieldClass}
                        />
                      )}
                    </div>
                  </div>
                )}

                {movementMode === "batch" && (
                  <div className="space-y-3">
                    {movementDrafts.map((row) => (
                      <div
                        key={row.id}
                        className="rounded-2xl border border-border bg-slate-50/80 dark:bg-slate-900/40 p-4 space-y-3"
                      >
                        <div className="flex gap-2">
                          <FormattedNumberInput
                            value={row.Value}
                            onChange={(n) =>
                              setMovementDrafts((rows) =>
                                rows.map((r) => (r.id === row.id ? { ...r, Value: n } : r))
                              )
                            }
                            placeholder="Valor"
                            className={`${fieldClass} font-semibold`}
                            showSpinner={false}
                          />
                          {movementDrafts.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setMovementDrafts((rows) => rows.filter((r) => r.id !== row.id))
                              }
                              className="text-slate-400 hover:text-red-500"
                            >
                              <span className="material-symbols-outlined">delete</span>
                            </button>
                          )}
                        </div>
                        <input
                          type="text"
                          value={row.Description}
                          onChange={(e) =>
                            setMovementDrafts((rows) =>
                              rows.map((r) =>
                                r.id === row.id ? { ...r, Description: e.target.value } : r
                              )
                            )
                          }
                          placeholder="Descrição"
                          className={fieldClass}
                        />
                        <CustomCombobox
                          options={categories}
                          value={row.Category}
                          onChange={(val) =>
                            setMovementDrafts((rows) =>
                              rows.map((r) => (r.id === row.id ? { ...r, Category: val } : r))
                            )
                          }
                          placeholder="Categoria"
                          className={fieldClass}
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addMovementCard}
                      className={`flex items-center gap-2 text-sm font-bold ${accentText}`}
                    >
                      <span className="material-symbols-outlined text-[18px]">add_circle</span>
                      Adicionar outra
                    </button>
                  </div>
                )}

                {movementMode === "csv" && (
                  <div className="space-y-4">
                    <CsvImportPanel
                      kind="movement"
                      defaultType={movimentacaoType}
                      onError={setError}
                      onParsed={(rows) => {
                        setError(null);
                        setCsvMovements(rows);
                        setSuccessHint(`${rows.length} linha(s) pronta(s) para importar.`);
                      }}
                    />
                    {csvMovements.length > 0 && (
                      <div className="max-h-48 overflow-y-auto rounded-xl border border-border divide-y divide-border text-sm">
                        {csvMovements.map((r, i) => (
                          <div
                            key={`${r.Description}-${i}`}
                            className="px-3 py-2 flex justify-between gap-2"
                          >
                            <span className="truncate">
                              {r.Description}
                              <span className="text-slate-400"> · {r.Category}</span>
                            </span>
                            <span className="font-semibold shrink-0">
                              {formatCurrency(r.Value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-600 dark:text-red-400 flex items-start gap-2">
                <span className="material-symbols-outlined text-[18px] mt-0.5">error</span>
                <span>{error}</span>
              </div>
            )}
            {successHint && !error && (
              <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm font-medium text-green-700 dark:text-green-400 flex items-start gap-2">
                <span className="material-symbols-outlined text-[18px] mt-0.5">check_circle</span>
                <span>{successHint}</span>
              </div>
            )}
          </div>

          {dataReady && step === "form" && (
            <div className="px-5 py-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0f172a]/50 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-3 text-sm font-bold text-slate-500 hover:text-foreground order-3 sm:order-1"
              >
                Cancelar
              </button>
              {((isPortfolio && portfolioMode !== "csv") ||
                (!isPortfolio && movementMode !== "csv")) && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() =>
                    isPortfolio ? handleSavePortfolio(true) : handleSaveMovement(true)
                  }
                  className="px-4 py-3 text-sm font-bold text-slate-600 dark:text-slate-300 border border-border rounded-xl hover:bg-surface order-2 disabled:opacity-50"
                >
                  Salvar e outro
                </button>
              )}
              <button
                type="button"
                disabled={loading}
                onClick={() =>
                  isPortfolio ? handleSavePortfolio(false) : handleSaveMovement(false)
                }
                className={`px-8 py-3 text-white text-sm font-bold rounded-xl shadow-lg transition-all active:scale-[0.97] disabled:opacity-50 order-1 sm:order-3 ${primaryBtn}`}
              >
                {loading ? "Salvando..." : "Salvar"}
              </button>
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}
