import fs from "fs";
import path from "path";
import Papa from "papaparse";

const databasePath = path.resolve(process.cwd(), "data/net-worth.csv");
const movementsPath = path.resolve(process.cwd(), "data/movements.csv");

export function getUniqueValuesFromDatabase(): { classifications: string[], assets: string[] } {
    try {
        if (!fs.existsSync(databasePath)) return { classifications: [], assets: [] };

        const fileContent = fs.readFileSync(databasePath, "utf-8");
        const parsed = Papa.parse(fileContent, {
            header: true,
            skipEmptyLines: true,
        });

        const classifications = new Set<string>();
        const assets = new Set<string>();

        (parsed.data as any[]).forEach(row => {
            if (row.Classification) classifications.add(row.Classification.trim());
            if (row.Asset) assets.add(row.Asset.trim());
        });

        return {
            classifications: Array.from(classifications).sort(),
            assets: Array.from(assets).sort(),
        };
    } catch (error) {
        console.error("Error extracting unique values from CSV:", error);
        return { classifications: [], assets: [] };
    }
}

export function getUniqueMovementValues(): { incomeCategories: string[], expenseCategories: string[] } {
    try {
        if (!fs.existsSync(movementsPath)) return { incomeCategories: [], expenseCategories: [] };

        const fileContent = fs.readFileSync(movementsPath, "utf-8");
        const parsed = Papa.parse(fileContent, {
            header: true,
            skipEmptyLines: true,
        });

        const incomeCategories = new Set<string>();
        const expenseCategories = new Set<string>();

        (parsed.data as any[]).forEach(row => {
            if (!row.Category || !row.Type) return;
            const cat = row.Category.trim();
            if (row.Type === "Income") {
                incomeCategories.add(cat);
            } else if (row.Type === "Expense") {
                expenseCategories.add(cat);
            }
        });

        return {
            incomeCategories: Array.from(incomeCategories).sort(),
            expenseCategories: Array.from(expenseCategories).sort(),
        };
    } catch (error) {
        console.error("Error extracting unique categories from movements CSV:", error);
        return { incomeCategories: [], expenseCategories: [] };
    }
}

export function readCustomCsv(filePath: string): string[] {
    try {
        if (!fs.existsSync(filePath)) return [];
        const content = fs.readFileSync(filePath, "utf-8");
        const parsed = Papa.parse(content, {
            header: true,
            skipEmptyLines: true,
        });
        return (parsed.data as any[]).map(row => row.Value.trim()).filter(Boolean);
    } catch (error) {
        console.error(`Error reading custom CSV ${filePath}:`, error);
        return [];
    }
}

export function writeCustomCsv(filePath: string, values: string[]) {
    const data = values.map(v => ({ Value: v }));
    const csv = Papa.unparse(data);
    fs.writeFileSync(filePath, csv, "utf-8");
}
