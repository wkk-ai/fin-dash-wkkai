export interface AssetEntry {
  Date: string;
  Classification: string;
  Asset: string;
  Value: number;
}

export interface MovementEntry {
  Date: string;
  Description: string;
  Category: string;
  Type: 'Income' | 'Expense';
  Value: number;
}

export interface BudgetEntry {
  Category: string;
  Budget: number;
}
