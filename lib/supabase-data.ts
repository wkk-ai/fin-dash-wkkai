import { supabase } from './supabase';
import { AssetEntry, MovementEntry, BudgetEntry, Settings } from '@/types/database';

function mapNetWorthRow(row: {
  date: string;
  classification: string;
  institution?: string | null;
  product_type?: string | null;
  asset: string;
  value: number | string;
}): AssetEntry {
  const asset = row.asset || '';
  const productType = (row.product_type && String(row.product_type).trim()) || asset;
  return {
    Date: row.date,
    Classification: row.classification,
    Institution: row.institution || '',
    ProductType: productType,
    Asset: asset,
    Value: Number(row.value),
  };
}

function toNetWorthInsert(entry: AssetEntry) {
  const asset = entry.Asset || '';
  const productType = (entry.ProductType || asset || '').trim() || asset;
  return {
    date: entry.Date,
    classification: entry.Classification,
    institution: entry.Institution || '',
    product_type: productType,
    asset,
    value: entry.Value,
  };
}

// ─── Net Worth (replaces /api/database) ────────────────────────────

export async function fetchNetWorth(): Promise<AssetEntry[]> {
  const withProduct = await supabase
    .from('net_worth')
    .select('date, classification, institution, product_type, asset, value')
    .order('date', { ascending: true });

  if (!withProduct.error) {
    return (withProduct.data || []).map(mapNetWorthRow);
  }

  // Pre-migration fallback (column not yet added)
  const legacy = await supabase
    .from('net_worth')
    .select('date, classification, institution, asset, value')
    .order('date', { ascending: true });
  if (legacy.error) throw withProduct.error;
  return (legacy.data || []).map(mapNetWorthRow);
}

export async function appendNetWorth(entry: AssetEntry): Promise<void> {
  const { error } = await supabase.from('net_worth').insert(toNetWorthInsert(entry));
  if (error) throw error;
}

export async function appendNetWorthBatch(entries: AssetEntry[]): Promise<void> {
  const rows = entries.map(toNetWorthInsert);
  const { error } = await supabase.from('net_worth').insert(rows);
  if (error) throw error;
}

/** Delete all net-worth rows for an exact snapshot date string (e.g. 01/May/26). */
export async function deleteNetWorthByDate(date: string): Promise<void> {
  const { error } = await supabase.from('net_worth').delete().eq('date', date);
  if (error) throw error;
}

/** Replace one month snapshot: wipe that date, then insert the new rows. */
export async function replaceNetWorthForDate(date: string, entries: AssetEntry[]): Promise<void> {
  await deleteNetWorthByDate(date);
  if (entries.length > 0) {
    await appendNetWorthBatch(entries.map((e) => ({ ...e, Date: date })));
  }
}

export async function replaceNetWorth(entries: AssetEntry[]): Promise<void> {
  // Delete all existing rows for this user, then insert new ones
  const { error: delError } = await supabase.from('net_worth').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (delError) throw delError;
  if (entries.length > 0) {
    await appendNetWorthBatch(entries);
  }
}

// ─── Movements (replaces /api/movements) ────────────────────────────

export async function fetchMovements(): Promise<{ movements: MovementEntry[]; budgets: BudgetEntry[] }> {
  const [movRes, budRes] = await Promise.all([
    supabase.from('movements').select('date, description, category, type, value').order('date', { ascending: true }),
    supabase.from('budgets').select('category, budget'),
  ]);

  if (movRes.error) throw movRes.error;
  if (budRes.error) throw budRes.error;

  const movements: MovementEntry[] = (movRes.data || []).map(row => ({
    Date: row.date,
    Description: row.description,
    Category: row.category,
    Type: row.type as 'Income' | 'Expense',
    Value: Number(row.value),
  }));

  const budgets: BudgetEntry[] = (budRes.data || []).map(row => ({
    Category: row.category,
    Budget: Number(row.budget),
  }));

  return { movements, budgets };
}

export async function appendMovement(entry: MovementEntry): Promise<void> {
  const { error } = await supabase.from('movements').insert({
    date: entry.Date,
    description: entry.Description,
    category: entry.Category,
    type: entry.Type,
    value: entry.Value,
  });
  if (error) throw error;
}

export async function replaceMovements(entries: MovementEntry[]): Promise<void> {
  const { error: delError } = await supabase.from('movements').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (delError) throw delError;
  if (entries.length > 0) {
    const rows = entries.map(e => ({
      date: e.Date,
      description: e.Description,
      category: e.Category,
      type: e.Type,
      value: e.Value,
    }));
    const { error } = await supabase.from('movements').insert(rows);
    if (error) throw error;
  }
}

export async function replaceBudgets(entries: BudgetEntry[]): Promise<void> {
  const { error: delError } = await supabase.from('budgets').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (delError) throw delError;
  if (entries.length > 0) {
    const rows = entries.map(e => ({
      category: e.Category,
      budget: e.Budget,
    }));
    const { error } = await supabase.from('budgets').insert(rows);
    if (error) throw error;
  }
}

// ─── Settings / Tags (replaces /api/settings) ───────────────────────

export async function fetchSettings(): Promise<Settings> {
  // Get unique values from data tables
  let nwRes = await supabase.from('net_worth').select('classification, institution, product_type, asset');
  if (nwRes.error) {
    nwRes = await supabase.from('net_worth').select('classification, institution, asset');
  }
  const [movRes, tagsRes] = await Promise.all([
    supabase.from('movements').select('category, type'),
    supabase.from('custom_tags').select('tag_type, value'),
  ]);

  const dbClassifications = new Set<string>();
  const dbInstitutions = new Set<string>();
  const dbProductTypes = new Set<string>();
  const dbAssets = new Set<string>();
  const dbIncomeCategories = new Set<string>();
  const dbExpenseCategories = new Set<string>();

  (nwRes.data || []).forEach(row => {
    if (row.classification) dbClassifications.add(row.classification);
    if (row.institution) dbInstitutions.add(row.institution);
    const pt = (row.product_type && String(row.product_type).trim()) || row.asset;
    if (pt) dbProductTypes.add(pt);
    if (row.asset) dbAssets.add(row.asset);
  });

  (movRes.data || []).forEach(row => {
    if (row.category) {
      if (row.type === 'Income') dbIncomeCategories.add(row.category);
      else dbExpenseCategories.add(row.category);
    }
  });

  // Merge with custom tags
  (tagsRes.data || []).forEach(tag => {
    switch (tag.tag_type) {
      case 'classification': dbClassifications.add(tag.value); break;
      case 'institution': dbInstitutions.add(tag.value); break;
      case 'product_type': dbProductTypes.add(tag.value); break;
      case 'asset': dbAssets.add(tag.value); break;
      case 'income_category': dbIncomeCategories.add(tag.value); break;
      case 'expense_category': dbExpenseCategories.add(tag.value); break;
    }
  });

  return {
    classifications: Array.from(dbClassifications).sort(),
    institutions: Array.from(dbInstitutions).sort(),
    productTypes: Array.from(dbProductTypes).sort(),
    assets: Array.from(dbAssets).sort(),
    incomeCategories: Array.from(dbIncomeCategories).sort(),
    expenseCategories: Array.from(dbExpenseCategories).sort(),
  };
}

export async function saveCustomTags(tagType: string, values: string[]): Promise<void> {
  // Get values from the data tables to exclude them (only save custom ones)
  let nwRes = await supabase.from('net_worth').select('classification, institution, product_type, asset');
  if (nwRes.error) {
    nwRes = await supabase.from('net_worth').select('classification, institution, asset');
  }
  const movRes = await supabase.from('movements').select('category, type');

  const dbValues = new Set<string>();
  if (tagType === 'classification') {
    (nwRes.data || []).forEach(r => { if (r.classification) dbValues.add(r.classification); });
  } else if (tagType === 'institution') {
    (nwRes.data || []).forEach(r => { if (r.institution) dbValues.add(r.institution); });
  } else if (tagType === 'product_type') {
    (nwRes.data || []).forEach(r => {
      const pt = (r.product_type && String(r.product_type).trim()) || r.asset;
      if (pt) dbValues.add(pt);
    });
  } else if (tagType === 'asset') {
    (nwRes.data || []).forEach(r => { if (r.asset) dbValues.add(r.asset); });
  } else if (tagType === 'income_category') {
    (movRes.data || []).forEach(r => { if (r.type === 'Income' && r.category) dbValues.add(r.category); });
  } else if (tagType === 'expense_category') {
    (movRes.data || []).forEach(r => { if (r.type === 'Expense' && r.category) dbValues.add(r.category); });
  }

  const customValues = values.filter(v => !dbValues.has(v));

  // Delete existing custom tags for this type, then insert new ones
  const { error: delError } = await supabase
    .from('custom_tags')
    .delete()
    .eq('tag_type', tagType);
  if (delError) throw delError;

  if (customValues.length > 0) {
    const rows = customValues.map(v => ({ tag_type: tagType, value: v }));
    const { error } = await supabase.from('custom_tags').insert(rows);
    if (error) throw error;
  }
}

// ─── Market Data (replaces /api/market) ─────────────────────────────

export async function fetchMarketData(): Promise<{ selic: string | null; ipca: string | null; updatedAt: string }> {
  try {
    const urls = [
      "https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json",
      "https://api.bcb.gov.br/dados/serie/bcdata.sgs.13522/dados/ultimos/1?formato=json"
    ];
    const [selicRes, ipcaRes] = await Promise.all(urls.map(url => fetch(url)));
    if (!selicRes.ok || !ipcaRes.ok) throw new Error("BCB API error");
    const [selicData, ipcaData] = await Promise.all([selicRes.json(), ipcaRes.json()]);
    return {
      selic: selicData[0]?.valor || null,
      ipca: ipcaData[0]?.valor || null,
      updatedAt: new Date().toISOString(),
    };
  } catch {
    return { selic: null, ipca: null, updatedAt: new Date().toISOString() };
  }
}
