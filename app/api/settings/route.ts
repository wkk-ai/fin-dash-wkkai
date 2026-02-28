import { NextResponse } from "next/server";
import path from "path";
import { getUniqueValuesFromDatabase, readCustomCsv, writeCustomCsv } from "@/lib/csv-utils";

const customClassPath = path.resolve(process.cwd(), "data/custom_classifications.csv");
const customAssetsPath = path.resolve(process.cwd(), "data/custom_assets.csv");

export async function GET() {
    try {
        const { classifications: dbClasses, assets: dbAssets } = getUniqueValuesFromDatabase();
        const customClasses = readCustomCsv(customClassPath);
        const customAssets = readCustomCsv(customAssetsPath);

        // Merge and deduplicate
        const allClassifications = Array.from(new Set([...dbClasses, ...customClasses])).sort();
        const allAssets = Array.from(new Set([...dbAssets, ...customAssets])).sort();

        return NextResponse.json({
            classifications: allClassifications,
            assets: allAssets,
        });
    } catch (error: any) {
        return NextResponse.json({ error: "Failed to load settings", details: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const { classifications, assets } = await request.json();
        const { classifications: dbClasses, assets: dbAssets } = getUniqueValuesFromDatabase();

        // Save only values NOT in the database (custom ones)
        const customClasses = classifications.filter((c: string) => !dbClasses.includes(c));
        const customAssets = assets.filter((a: string) => !dbAssets.includes(a));

        writeCustomCsv(customClassPath, customClasses);
        writeCustomCsv(customAssetsPath, customAssets);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: "Failed to save settings", details: error.message }, { status: 500 });
    }
}
