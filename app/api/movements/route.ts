import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import Papa from "papaparse";
import { MovementEntry, BudgetEntry } from "@/types/database";

const movementsPath = path.resolve(process.cwd(), "data/movements.csv");
const budgetsPath = path.resolve(process.cwd(), "data/budgets.csv");

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        let movements: MovementEntry[] = [];
        let budgets: BudgetEntry[] = [];

        if (fs.existsSync(movementsPath)) {
            const content = fs.readFileSync(movementsPath, "utf-8");
            const parsed = Papa.parse(content, { header: true, skipEmptyLines: true });
            movements = (parsed.data as any[]).map(row => ({
                Date: String(row.Date || "").trim(),
                Description: String(row.Description || "").trim(),
                Category: String(row.Category || "").trim(),
                Type: row.Type as 'Income' | 'Expense',
                Value: Number(row.Value || 0)
            }));
        }

        if (fs.existsSync(budgetsPath)) {
            const content = fs.readFileSync(budgetsPath, "utf-8");
            const parsed = Papa.parse(content, { header: true, skipEmptyLines: true });
            budgets = (parsed.data as any[]).map(row => ({
                Category: String(row.Category || "").trim(),
                Budget: Number(row.Budget || 0)
            }));
        }

        return NextResponse.json({ movements, budgets });
    } catch (error: any) {
        return NextResponse.json({ error: "Error reading movements", details: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();

        if (body.action === "append") {
            const movement = body.data as MovementEntry;
            const fileContent = fs.existsSync(movementsPath) ? fs.readFileSync(movementsPath, "utf-8") : "Date,Description,Category,Type,Value";
            const lineEnding = fileContent.includes("\r\n") ? "\r\n" : "\n";
            const trimmedContent = fileContent.trimEnd();
            const newRow = `${lineEnding}${movement.Date},${movement.Description},${movement.Category},${movement.Type},${movement.Value}`;
            fs.writeFileSync(movementsPath, trimmedContent + newRow, "utf-8");
            return NextResponse.json({ success: true });
        }

        if (body.action === "updateMovements") {
            const movements = body.data as MovementEntry[];
            const csvData = Papa.unparse(movements);
            fs.writeFileSync(movementsPath, csvData, "utf-8");
            return NextResponse.json({ success: true });
        }

        if (body.action === "updateBudgets") {
            const budgets = body.data as BudgetEntry[];
            const csv = Papa.unparse(budgets);
            fs.writeFileSync(budgetsPath, csv, "utf-8");
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    } catch (error: any) {
        return NextResponse.json({ error: "Error updating movements", details: error.message }, { status: 500 });
    }
}
