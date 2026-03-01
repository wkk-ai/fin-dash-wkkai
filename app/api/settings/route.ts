import { NextResponse } from "next/server";
import path from "path";
import { getUniqueValuesFromDatabase, getUniqueMovementValues, readCustomCsv, writeCustomCsv } from "@/lib/csv-utils";

const customClassPath = path.resolve(process.cwd(), "data/custom_classifications.csv");
const customAssetsPath = path.resolve(process.cwd(), "data/custom_assets.csv");
const customMovementsPath = path.resolve(process.cwd(), "data/custom_movements_categories.csv");

export async function GET() {
    try {
        const { classifications: dbClasses, assets: dbAssets } = getUniqueValuesFromDatabase();
        const { incomeCategories: dbIncomeCats, expenseCategories: dbExpenseCats } = getUniqueMovementValues();

        const customClasses = readCustomCsv(customClassPath);
        const customAssets = readCustomCsv(customAssetsPath);
        const customIncome = readCustomCsv(path.resolve(process.cwd(), "data/custom_income_categories.csv"));
        const customExpense = readCustomCsv(path.resolve(process.cwd(), "data/custom_expense_categories.csv"));

        return NextResponse.json({
            classifications: Array.from(new Set([...dbClasses, ...customClasses])).sort(),
            assets: Array.from(new Set([...dbAssets, ...customAssets])).sort(),
            incomeCategories: Array.from(new Set([...dbIncomeCats, ...customIncome])).sort(),
            expenseCategories: Array.from(new Set([...dbExpenseCats, ...customExpense])).sort(),
        });
    } catch (error: any) {
        return NextResponse.json({ error: "Failed to load settings", details: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const { classifications, assets, movementCategories } = await request.json();
        const { classifications: dbClasses, assets: dbAssets } = getUniqueValuesFromDatabase();
        const { categories: dbMovementCategories } = getUniqueMovementValues();

        // Save only values NOT in the database (custom ones)
        if (classifications) {
            const customClasses = classifications.filter((c: string) => !dbClasses.includes(c));
            writeCustomCsv(customClassPath, customClasses);
        }

        if (assets) {
            const customAssets = assets.filter((a: string) => !dbAssets.includes(a));
            writeCustomCsv(customAssetsPath, customAssets);
        }

        if (movementCategories) {
            const customMovements = movementCategories.filter((c: string) => !dbMovementCategories.includes(c));
            writeCustomCsv(customMovementsPath, customMovements);
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: "Failed to save settings", details: error.message }, { status: 500 });
    }
}
