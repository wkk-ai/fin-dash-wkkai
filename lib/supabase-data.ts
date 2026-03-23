import { supabase } from './supabase';
import { AssetEntry, MovementEntry, BudgetEntry, Settings } from '@/types/database';

// ─── Net Worth (replaces /api/database) ────────────────────────────

export async function fetchNetWorth(): Promise<AssetEntry[]> {
  const { data, error } = await supabase
    .from('net_worth')
    .select('date, classification, institution, asset, value')
    .order('date', { ascending: true });

  if (error) throw error;
  return (data || []).map(row => ({
    Date: row.date,
    Classification: row.classification,
    Institution: row.institution || '',
    Asset: row.asset,
    Value: Number(row.value),
  }));
}

export async function appendNetWorth(entry: AssetEntry): Promise<void> {
  const { error } = await supabase.from('net_worth').insert({
    date: entry.Date,
    classification: entry.Classification,
    institution: entry.Institution || '',
    asset: entry.Asset,
    value: entry.Value,
  });
  if (error) throw error;
}

export async function appendNetWorthBatch(entries: AssetEntry[]): Promise<void> {
  const rows = entries.map(e => ({
    date: e.Date,
    classification: e.Classification,
    institution: e.Institution || '',
    asset: e.Asset,
    value: e.Value,
  }));
  const { error } = await supabase.from('net_worth').insert(rows);
  if (error) throw error;
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
  const [nwRes, movRes, tagsRes] = await Promise.all([
    supabase.from('net_worth').select('classification, institution, asset'),
    supabase.from('movements').select('category, type'),
    supabase.from('custom_tags').select('tag_type, value'),
  ]);

  const dbClassifications = new Set<string>();
  const dbInstitutions = new Set<string>();
  const dbAssets = new Set<string>();
  const dbIncomeCategories = new Set<string>();
  const dbExpenseCategories = new Set<string>();

  (nwRes.data || []).forEach(row => {
    if (row.classification) dbClassifications.add(row.classification);
    if (row.institution) dbInstitutions.add(row.institution);
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
      case 'asset': dbAssets.add(tag.value); break;
      case 'income_category': dbIncomeCategories.add(tag.value); break;
      case 'expense_category': dbExpenseCategories.add(tag.value); break;
    }
  });

  return {
    classifications: Array.from(dbClassifications).sort(),
    institutions: Array.from(dbInstitutions).sort(),
    assets: Array.from(dbAssets).sort(),
    incomeCategories: Array.from(dbIncomeCategories).sort(),
    expenseCategories: Array.from(dbExpenseCategories).sort(),
  };
}

export async function saveCustomTags(tagType: string, values: string[]): Promise<void> {
  // Get values from the data tables to exclude them (only save custom ones)
  const [nwRes, movRes] = await Promise.all([
    supabase.from('net_worth').select('classification, institution, asset'),
    supabase.from('movements').select('category, type'),
  ]);

  const dbValues = new Set<string>();
  if (tagType === 'classification') {
    (nwRes.data || []).forEach(r => { if (r.classification) dbValues.add(r.classification); });
  } else if (tagType === 'institution') {
    (nwRes.data || []).forEach(r => { if (r.institution) dbValues.add(r.institution); });
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
