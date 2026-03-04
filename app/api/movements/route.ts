import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { MovementEntry, BudgetEntry } from "@/types/database";

const movementsPath = path.resolve(process.cwd(), "data/movements.csv");
const budgetsPath = path.resolve(process.cwd(), "data/budgets.csv");
const REQUIRED_COLUMNS = ["Date", "Description", "Category", "Value"] as const;

function formatDateToCsv(date: Date): string {
    const day = String(date.getDate()).padStart(2, "0");
    const month = date.toLocaleString("en-US", { month: "short" });
    const year = String(date.getFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
}

function parseDateValue(input: unknown): string | null {
    if (input === null || input === undefined) return null;
    if (input instanceof Date && !Number.isNaN(input.getTime())) return formatDateToCsv(input);
    if (typeof input === "number" && Number.isFinite(input)) {
        const serialMs = Math.round((input - 25569) * 86400 * 1000);
        const dt = new Date(serialMs);
        if (!Number.isNaN(dt.getTime())) return formatDateToCsv(dt);
        return null;
    }
    const s = String(input).trim();
    if (!s) return null;
    let match = s.match(/^(\d{2})[-/.](\d{2})[-/.](\d{4})$/);
    if (match) {
        const [, dd, mm, yyyy] = match;
        const dt = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
        if (!Number.isNaN(dt.getTime())) return formatDateToCsv(dt);
    }
    const parsed = new Date(s);
    if (!Number.isNaN(parsed.getTime())) return formatDateToCsv(parsed);
    return null;
}

const HEADER_MAP: Record<string, string> = {
    "data": "Date",
    "date": "Date",
    "descrição": "Description",
    "description": "Description",
    "desc": "Description",
    "categoria": "Category",
    "category": "Category",
    "valor": "Value",
    "value": "Value",
    "type": "Type", // Keep for legacy
    "tipo": "Type"
};

function parseNumberValue(input: unknown): number | null {
    if (typeof input === "number" && Number.isFinite(input)) return input;
    let s = String(input || "").trim().replace(/\s/g, "");
    if (!s) return null;

    // Handle currency symbols (R$, $, etc)
    s = s.replace(/^[^\d-]+/, "");

    // Heuristic for BR format vs US format
    // 5.000,00 -> 5000.00
    // 5,000.00 -> 5000.00
    const hasComma = s.includes(",");
    const hasDot = s.includes(".");

    if (hasComma && hasDot) {
        if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
            // BR format
            s = s.replace(/\./g, "").replace(",", ".");
        } else {
            // US format
            s = s.replace(/,/g, "");
        }
    } else if (hasComma) {
        // If only comma, assume it's decimal separator (Brazilian format common in CSVs)
        s = s.replace(",", ".");
    }

    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

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
                Type: (row.Type as 'Income' | 'Expense') || (Number(row.Value) >= 0 ? "Income" : "Expense"),
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
        const contentType = request.headers.get("content-type") || "";

        if (contentType.includes("multipart/form-data")) {
            const formData = await request.formData();
            const file = formData.get("file") as File | null;
            if (!file) return NextResponse.json({ errorCode: "NO_FILE" }, { status: 400 });

            const bytes = Buffer.from(await file.arrayBuffer());
            const fileName = file.name.toLowerCase();
            let rows: any[] = [];
            let headers: string[] = [];

            if (fileName.endsWith(".csv")) {
                const text = bytes.toString("utf-8");
                const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, transformHeader: h => h.trim() });
                headers = (parsed.meta.fields || []).map(h => h.trim());
                rows = parsed.data;
            } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
                const workbook = XLSX.read(bytes, { type: "buffer", cellDates: true });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const matrix = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, raw: true });
                headers = (matrix[0] || []).map(v => String(v || "").trim());
                rows = matrix.slice(1).map(r => {
                    const obj: any = {};
                    headers.forEach((h, i) => {
                        obj[h] = r[i];
                    });
                    return obj;
                });
            } else {
                return NextResponse.json({ errorCode: "UNSUPPORTED_FILE_TYPE" }, { status: 400 });
            }

            // Map and normalize headers
            const normalizedHeaders = headers.map(h => HEADER_MAP[h.toLowerCase()] || h);

            // Check if we have at least the required columns
            const missing = REQUIRED_COLUMNS.filter(req => !normalizedHeaders.includes(req));

            if (missing.length > 0) {
                // If column names don't match, check if we have exactly 4 columns and use indices as fallback
                if (headers.length >= 4) {
                    // Force mapping by index if headers are unknown but count is right
                    rows = rows.map(r => {
                        const values = Object.values(r);
                        return {
                            Date: values[0],
                            Description: values[1],
                            Category: values[2],
                            Value: values[3]
                        };
                    });
                } else {
                    return NextResponse.json({
                        errorCode: "COLUMN_NAMES",
                        expected: REQUIRED_COLUMNS.join(", "),
                        received: headers.join(", ")
                    }, { status: 400 });
                }
            } else {
                // Map rows using normalized headers
                rows = rows.map(r => {
                    const newRow: any = {};
                    headers.forEach(h => {
                        const normalized = HEADER_MAP[h.toLowerCase()] || h;
                        newRow[normalized] = r[h];
                    });
                    return newRow;
                });
            }

            const normalized: MovementEntry[] = [];
            for (let i = 0; i < rows.length; i++) {
                const r = rows[i];
                const date = parseDateValue(r.Date);
                const value = parseNumberValue(r.Value);
                if (!date || value === null) continue;

                // Infer type if missing
                let type: 'Income' | 'Expense' = "Expense";
                if (r.Type) {
                    type = r.Type === "Income" ? "Income" : "Expense";
                } else {
                    type = value >= 0 ? "Income" : "Expense";
                }

                normalized.push({
                    Date: date,
                    Description: String(r.Description || "").trim(),
                    Category: String(r.Category || "").trim(),
                    Type: type,
                    Value: Math.abs(value) * (type === "Expense" ? -1 : 1) // Ensure sign matches type
                });
            }

            if (normalized.length === 0) return NextResponse.json({ errorCode: "CSV_FORMAT" }, { status: 400 });

            fs.writeFileSync(movementsPath, Papa.unparse(normalized), "utf-8");
            return NextResponse.json({ success: true, count: normalized.length });
        }

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
