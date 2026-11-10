export type Classification = string;
export type Institution = string;
export type ProductType = string;
export type Asset = string;

export interface AssetEntry {
  Date: string;
  Classification: string;
  Institution: string;
  ProductType: string;
  Asset: string;
  Value: number;
  /** Public bonds only: value "na curva" (bought rate kept to maturity). Null = same as Value. */
  ValueCurve?: number | null;
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

export interface Settings {
  classifications: string[];
  institutions: string[];
  productTypes: string[];
  assets: string[];
  incomeCategories: string[];
  expenseCategories: string[];
}
