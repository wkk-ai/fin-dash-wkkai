import Papa from "papaparse";
import { AssetEntry, MovementEntry } from "@/types/database";
import { formatCustomDate, parseCustomDate, normalizeDbDateToMonthStart, pickMonthlySnapshotDates } from "@/lib/utils";

export function todayInputDate(): string {
  return new Date().toISOString().split("T")[0];
}

export function inputDateToDbDate(inputDate: string): string {
  if (!inputDate) return "";
  const d = new Date(`${inputDate}T12:00:00Z`);
  return formatCustomDate(d);
}

export function dbDateToInputDate(dbDate: string): string {
  if (!dbDate) return "";
  const d = parseCustomDate(dbDate);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
}

export function newRowId(): string {
  return Math.random().toString(36).slice(2, 11);
}

export function parseMoneyCell(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (raw == null) return NaN;
  let s = String(raw).trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  if (!s) return NaN;
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "");
}

const ASSET_HEADER_MAP: Record<string, keyof AssetEntry> = {
  date: "Date",
  data: "Date",
  classification: "Classification",
  classificacao: "Classification",
  classificação: "Classification",
  institution: "Institution",
  instituicao: "Institution",
  instituição: "Institution",
  producttype: "ProductType",
  product_type: "ProductType",
  tipo: "ProductType",
  tipodeativo: "ProductType",
  tipo_de_ativo: "ProductType",
  asset: "Asset",
  ativo: "Asset",
  value: "Value",
  valor: "Value",
};

const MOVEMENT_HEADER_MAP: Record<string, keyof MovementEntry | "Type"> = {
  date: "Date",
  data: "Date",
  description: "Description",
  descricao: "Description",
  descrição: "Description",
  category: "Category",
  categoria: "Category",
  type: "Type",
  tipo: "Type",
  value: "Value",
  valor: "Value",
};

export type CsvParseResult<T> =
  | { ok: true; rows: T[] }
  | { ok: false; error: string };

function mapAssetRow(row: Record<string, unknown>): AssetEntry | null {
  const mapped: Partial<AssetEntry> = {};
  for (const [key, val] of Object.entries(row)) {
    const field = ASSET_HEADER_MAP[normalizeHeader(key)];
    if (!field) continue;
    if (field === "Value") {
      mapped.Value = parseMoneyCell(val);
    } else {
      mapped[field] = String(val ?? "").trim();
    }
  }
  if (!mapped.Asset && !mapped.Institution) return null;
  const value = mapped.Value;
  if (value == null || Number.isNaN(value)) return null;

  let date = mapped.Date || "";
  if (date && /^\d{4}-\d{2}-\d{2}/.test(date)) {
    date = inputDateToDbDate(date.slice(0, 10));
  } else if (date && !date.includes("/")) {
    date = inputDateToDbDate(todayInputDate());
  } else if (!date) {
    date = inputDateToDbDate(todayInputDate());
  } else {
    // already DD/MMM/YY or similar — normalize via parse
    const parsed = parseCustomDate(date);
    date = isNaN(parsed.getTime()) ? inputDateToDbDate(todayInputDate()) : formatCustomDate(parsed);
  }

  date = normalizeDbDateToMonthStart(date);

  const asset = mapped.Asset || mapped.Institution || "";

  return {
    Date: date,
    Classification: mapped.Classification || "",
    Institution: mapped.Institution || asset,
    ProductType: mapped.ProductType || asset,
    Asset: asset,
    Value: value,
  };
}

function mapMovementRow(row: Record<string, unknown>, defaultType: "Income" | "Expense"): MovementEntry | null {
  const mapped: Partial<MovementEntry> = {};
  let typeRaw = "";
  for (const [key, val] of Object.entries(row)) {
    const field = MOVEMENT_HEADER_MAP[normalizeHeader(key)];
    if (!field) continue;
    if (field === "Value") {
      mapped.Value = parseMoneyCell(val);
    } else if (field === "Type") {
      typeRaw = String(val ?? "").trim();
    } else {
      (mapped as Record<string, string>)[field] = String(val ?? "").trim();
    }
  }
  if (!mapped.Description) return null;
  const value = mapped.Value;
  if (value == null || Number.isNaN(value) || value === 0) return null;

  let type: "Income" | "Expense" = defaultType;
  const t = typeRaw.toLowerCase();
  if (["income", "receita", "in", "+"].includes(t)) type = "Income";
  if (["expense", "despesa", "out", "-"].includes(t)) type = "Expense";

  let date = mapped.Date || "";
  if (date && /^\d{4}-\d{2}-\d{2}/.test(date)) {
    date = inputDateToDbDate(date.slice(0, 10));
  } else if (!date) {
    date = inputDateToDbDate(todayInputDate());
  } else {
    const parsed = parseCustomDate(date);
    date = isNaN(parsed.getTime()) ? inputDateToDbDate(todayInputDate()) : formatCustomDate(parsed);
  }

  date = normalizeDbDateToMonthStart(date);

  return {
    Date: date,
    Description: mapped.Description,
    Category: mapped.Category || "",
    Type: type,
    Value: Math.abs(value),
  };
}

export function parsePortfolioCsv(text: string): CsvParseResult<AssetEntry> {
  const trimmed = text.trim();
  if (trimmed.startsWith("[")) {
    try {
      const json = JSON.parse(trimmed) as Record<string, unknown>[];
      if (!Array.isArray(json)) return { ok: false, error: "JSON deve ser uma lista de linhas." };
      const rows = json.map(mapAssetRow).filter((r): r is AssetEntry => r != null);
      if (rows.length === 0) return { ok: false, error: "Nenhuma linha válida no JSON." };
      return { ok: true, rows };
    } catch {
      return { ok: false, error: "JSON inválido." };
    }
  }

  const parsed = Papa.parse<Record<string, unknown>>(trimmed, {
    header: true,
    skipEmptyLines: true,
  });
  if (parsed.errors.length > 0 && (!parsed.data || parsed.data.length === 0)) {
    return { ok: false, error: parsed.errors[0]?.message || "CSV inválido." };
  }
  const rows = (parsed.data || []).map(mapAssetRow).filter((r): r is AssetEntry => r != null);
  if (rows.length === 0) {
    return {
      ok: false,
      error: "Nenhuma linha válida. Use colunas: Date, Classification, Institution, Asset, Value.",
    };
  }
  return { ok: true, rows };
}

export function parseMovementsCsv(
  text: string,
  defaultType: "Income" | "Expense"
): CsvParseResult<MovementEntry> {
  const trimmed = text.trim();
  if (trimmed.startsWith("[")) {
    try {
      const json = JSON.parse(trimmed) as Record<string, unknown>[];
      if (!Array.isArray(json)) return { ok: false, error: "JSON deve ser uma lista de linhas." };
      const rows = json.map((r) => mapMovementRow(r, defaultType)).filter((r): r is MovementEntry => r != null);
      if (rows.length === 0) return { ok: false, error: "Nenhuma linha válida no JSON." };
      return { ok: true, rows };
    } catch {
      return { ok: false, error: "JSON inválido." };
    }
  }

  const parsed = Papa.parse<Record<string, unknown>>(trimmed, {
    header: true,
    skipEmptyLines: true,
  });
  if (parsed.errors.length > 0 && (!parsed.data || parsed.data.length === 0)) {
    return { ok: false, error: parsed.errors[0]?.message || "CSV inválido." };
  }
  const rows = (parsed.data || [])
    .map((r) => mapMovementRow(r, defaultType))
    .filter((r): r is MovementEntry => r != null);
  if (rows.length === 0) {
    return {
      ok: false,
      error: "Nenhuma linha válida. Use colunas: Date, Description, Category, Type, Value.",
    };
  }
  return { ok: true, rows };
}

export function buildAssetRelations(data: AssetEntry[]) {
  const assetsByInstitution: Record<string, Set<string>> = {};
  const institutionsByAsset: Record<string, Set<string>> = {};
  const assetsByClass: Record<string, Set<string>> = {};
  const institutionsByClass: Record<string, Set<string>> = {};
  const productTypesByInstitution: Record<string, Set<string>> = {};
  const assetsByProductType: Record<string, Set<string>> = {};
  const productTypesByClass: Record<string, Set<string>> = {};
  const classByAssetInst: Record<string, string> = {};

  data.forEach((row) => {
    const inst = row.Institution || row.Asset;
    const asset = row.Asset;
    const product = row.ProductType || row.Asset;
    const cls = row.Classification;
    if (!assetsByInstitution[inst]) assetsByInstitution[inst] = new Set();
    assetsByInstitution[inst].add(asset);
    if (!institutionsByAsset[asset]) institutionsByAsset[asset] = new Set();
    institutionsByAsset[asset].add(inst);
    if (!productTypesByInstitution[inst]) productTypesByInstitution[inst] = new Set();
    productTypesByInstitution[inst].add(product);
    if (!assetsByProductType[product]) assetsByProductType[product] = new Set();
    assetsByProductType[product].add(asset);
    if (cls) {
      if (!assetsByClass[cls]) assetsByClass[cls] = new Set();
      assetsByClass[cls].add(asset);
      if (!institutionsByClass[cls]) institutionsByClass[cls] = new Set();
      institutionsByClass[cls].add(inst);
      if (!productTypesByClass[cls]) productTypesByClass[cls] = new Set();
      productTypesByClass[cls].add(product);
      classByAssetInst[`${inst}::${product}::${asset}`] = cls;
      classByAssetInst[`${inst}::${asset}`] = cls;
    }
  });

  return {
    assetsByInstitution,
    institutionsByAsset,
    assetsByClass,
    institutionsByClass,
    productTypesByInstitution,
    assetsByProductType,
    productTypesByClass,
    classByAssetInst,
  };
}

export function latestSnapshotAssets(data: AssetEntry[]): {
  dateStr: string;
  assets: AssetEntry[];
} | null {
  if (data.length === 0) return null;
  const dates = Array.from(new Set(data.map((d) => d.Date)));
  dates.sort((a, b) => parseCustomDate(a).getTime() - parseCustomDate(b).getTime());
  const dateStr = dates[dates.length - 1];
  const assets = data
    .filter((d) => d.Date === dateStr)
    .sort((a, b) => b.Value - a.Value);
  return { dateStr, assets };
}

/** Latest monthly snapshot strictly before the given DB date (usually day-1 of selected month). */
export function snapshotBeforeDate(
  data: AssetEntry[],
  beforeDateStr: string
): { dateStr: string; assets: AssetEntry[] } | null {
  if (data.length === 0 || !beforeDateStr) return null;
  const beforeTs = parseCustomDate(beforeDateStr).getTime();
  if (isNaN(beforeTs)) return null;

  const monthly = pickMonthlySnapshotDates(Array.from(new Set(data.map((d) => d.Date)))).filter(
    (d) => parseCustomDate(d).getTime() < beforeTs
  );
  if (monthly.length === 0) return null;
  const dateStr = monthly[monthly.length - 1];
  const assets = data
    .filter((d) => d.Date === dateStr)
    .sort((a, b) => b.Value - a.Value);
  return { dateStr, assets };
}

/** Assets for an exact snapshot date string. */
export function assetsOnDate(data: AssetEntry[], dateStr: string): AssetEntry[] {
  return data
    .filter((d) => d.Date === dateStr)
    .sort((a, b) => b.Value - a.Value);
}
