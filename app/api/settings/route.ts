import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const settingsPath = path.resolve(process.cwd(), "settings.json");

export async function GET() {
    try {
        if (!fs.existsSync(settingsPath)) {
            // Create defaults
            const defaultSettings = {
                classifications: ["Variable Income", "Fixed Income", "Pension Fund", "Real State"],
                assets: ["Clear", "XP", "Nubank", "Itau", "Binance", "C6", "FGTS", "Inv. Apto", "Inter", "Sara", "Mercado Pago"],
            };
            fs.writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2));
            return NextResponse.json(defaultSettings);
        }

        const fileContent = fs.readFileSync(settingsPath, "utf-8");
        return NextResponse.json(JSON.parse(fileContent));
    } catch (error: any) {
        return NextResponse.json({ error: "Failed to read settings", details: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        fs.writeFileSync(settingsPath, JSON.stringify(body, null, 2));
        return NextResponse.json({ success: true, settings: body });
    } catch (error: any) {
        return NextResponse.json({ error: "Failed to save settings", details: error.message }, { status: 500 });
    }
}
