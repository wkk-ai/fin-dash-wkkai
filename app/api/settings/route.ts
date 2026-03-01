import { NextResponse } from "next/server";
import path from "path";
import { getUniqueValuesFromDatabase, getUniqueMovementValues, readCustomCsv, writeCustomCsv } from "@/lib/csv-utils";

const customClassPath = path.resolve(process.cwd(), "data/custom_classifications.csv");
const customAssetsPath = path.resolve(process.cwd(), "data/custom_assets.csv");
const customIncomePath = path.resolve(process.cwd(), "data/custom_income_categories.csv");
const customExpensePath = path.resolve(process.cwd(), "data/custom_expense_categories.csv");

export async function GET() {
    try {
        const { classifications: dbClasses, assets: dbAssets } = getUniqueValuesFromDatabase();
        const { incomeCategories: dbIncomeCats, expenseCategories: dbExpenseCats } = getUniqueMovementValues();

        const customClasses = readCustomCsv(customClassPath);
        const customAssets = readCustomCsv(customAssetsPath);
        const customIncome = readCustomCsv(customIncomePath);
        const customExpense = readCustomCsv(customExpensePath);

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
        const { classifications, assets, incomeCategories, expenseCategories } = await request.json();
        const { classifications: dbClasses, assets: dbAssets } = getUniqueValuesFromDatabase();
        const { incomeCategories: dbIncomeCats, expenseCategories: dbExpenseCats } = getUniqueMovementValues();

        // Save only values NOT in the database (custom ones)
        if (classifications) {
            const customClasses = classifications.filter((c: string) => !dbClasses.includes(c));
            writeCustomCsv(customClassPath, customClasses);
        }

        if (assets) {
            const customAssets = assets.filter((a: string) => !dbAssets.includes(a));
            writeCustomCsv(customAssetsPath, customAssets);
        }

        if (incomeCategories) {
            const customIncome = incomeCategories.filter((c: string) => !dbIncomeCats.includes(c));
            writeCustomCsv(customIncomePath, customIncome);
        }

        if (expenseCategories) {
            const customExpense = expenseCategories.filter((c: string) => !dbExpenseCats.includes(c));
            writeCustomCsv(customExpensePath, customExpense);
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: "Failed to save settings", details: error.message }, { status: 500 });
    }
}
