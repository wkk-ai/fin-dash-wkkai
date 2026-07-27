const STORAGE_KEY = "dash-fin-entry-memory";

export type EntryMemory = {
  classification?: string;
  institution?: string;
  asset?: string;
  categoryExpense?: string;
  categoryIncome?: string;
};

export function loadEntryMemory(): EntryMemory {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as EntryMemory;
  } catch {
    return {};
  }
}

export function saveEntryMemory(patch: EntryMemory) {
  if (typeof window === "undefined") return;
  try {
    const next = { ...loadEntryMemory(), ...patch };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota / private mode
  }
}
