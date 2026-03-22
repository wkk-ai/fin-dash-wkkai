import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { AssetEntry } from "@/types/database";

const databasePath = path.resolve(
    process.cwd(),
    "data/net-worth.csv"
);
const customClassPath = path.resolve(process.cwd(), "data/custom_classifications.csv");
const customAssetsPath = path.resolve(process.cwd(), "data/custom_assets.csv");
const REQUIRED_COLUMNS = ["Date", "Classification", "Institution", "Asset", "Value"] as const;

function formatDateToCsv(date: Date): string {
    const day = String(date.getDate()).padStart(2, "0");
    const month = date.toLocaleString("en-US", { month: "short" });
    const year = String(date.getFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
}

function parseDateValue(input: unknown): string | null {
    if (input === null || input === undefined) return null;

    if (input instanceof Date && !Number.isNaN(input.getTime())) {
        return formatDateToCsv(input);
    }

    if (typeof input === "number" && Number.isFinite(input)) {
        const raw = String(Math.trunc(input));
        if (/^\d{8}$/.test(raw)) {
            const y = Number(raw.slice(0, 4));
            const m = Number(raw.slice(4, 6));
            const d = Number(raw.slice(6, 8));
            const dt = new Date(y, m - 1, d);
            if (!Number.isNaN(dt.getTime()) && dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) {
                return formatDateToCsv(dt);
            }
        }
        // Excel serial date handling
        const serialMs = Math.round((input - 25569) * 86400 * 1000);
        const dt = new Date(serialMs);
        if (!Number.isNaN(dt.getTime())) return formatDateToCsv(dt);
        return null;
    }

    const s = String(input).trim();
    if (!s) return null;

    if (/^\d{8}$/.test(s)) {
        const y = Number(s.slice(0, 4));
        const m = Number(s.slice(4, 6));
        const d = Number(s.slice(6, 8));
        const dt = new Date(y, m - 1, d);
        if (!Number.isNaN(dt.getTime()) && dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) {
            return formatDateToCsv(dt);
        }
    }

    let match = s.match(/^(\d{2})[-/.](\d{2})[-/.](\d{4})$/);
    if (match) {
        const [, dd, mm, yyyy] = match;
        const dt = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
        if (!Number.isNaN(dt.getTime())) return formatDateToCsv(dt);
    }

    match = s.match(/^(\d{4})[-/.](\d{2})[-/.](\d{2})$/);
    if (match) {
        const [, yyyy, mm, dd] = match;
        const dt = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
        if (!Number.isNaN(dt.getTime())) return formatDateToCsv(dt);
    }

    const parsed = new Date(s);
    if (!Number.isNaN(parsed.getTime())) return formatDateToCsv(parsed);
    return null;
}

function parseNumberValue(input: unknown): number | null {
    if (typeof input === "number" && Number.isFinite(input)) return input;
    if (input === null || input === undefined) return null;

    let s = String(input).trim();
    if (!s) return null;
    s = s.replace(/\s/g, "");
    s = s.replace(/[^\d,.-]/g, "");
    if (!s) return null;

    const hasComma = s.includes(",");
    const hasDot = s.includes(".");

    if (hasComma && hasDot) {
        const lastComma = s.lastIndexOf(",");
        const lastDot = s.lastIndexOf(".");
        if (lastComma > lastDot) {
            s = s.replace(/\./g, "").replace(",", ".");
        } else {
            s = s.replace(/,/g, "");
        }
    } else if (hasComma) {
        const commaCount = (s.match(/,/g) || []).length;
        if (commaCount > 1) {
            s = s.replace(/,/g, "");
        } else {
            const [, dec = ""] = s.split(",");
            s = dec.length <= 2 ? s.replace(",", ".") : s.replace(",", "");
        }
    } else if (hasDot) {
        const dotCount = (s.match(/\./g) || []).length;
        if (dotCount > 1) {
            const [, dec = ""] = s.split(".").slice(-2);
            s = dec.length <= 2 ? s.replace(/\./g, "").replace(/(\d+)(\d{2})$/, "$1.$2") : s.replace(/\./g, "");
        }
    }

    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

type ColumnValidationError =
    | { errorCode: "COLUMN_COUNT"; expected: number; received: number }
    | { errorCode: "COLUMN_NAMES"; expected: string; received: string };

function validateColumns(headers: string[]): ColumnValidationError | null {
    if (headers.length !== REQUIRED_COLUMNS.length) {
        return { errorCode: "COLUMN_COUNT", expected: REQUIRED_COLUMNS.length, received: headers.length };
    }
    const exact = REQUIRED_COLUMNS.every((c, i) => headers[i] === c);
    if (!exact) {
        return { errorCode: "COLUMN_NAMES", expected: REQUIRED_COLUMNS.join(", "), received: headers.join(", ") };
    }
    return null;
}

function normalizeRows(rows: Record<string, unknown>[]): { data: AssetEntry[]; error?: string } {
    const out: AssetEntry[] = [];
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const date = parseDateValue(r.Date);
        const classification = String(r.Classification ?? "").trim();
        const institution = String(r.Institution ?? "").trim();
        const asset = String(r.Asset ?? "").trim();
        const value = parseNumberValue(r.Value);

        if (!date) return { data: [], error: `Row ${i + 2}: invalid Date value.` };
        if (!classification) return { data: [], error: `Row ${i + 2}: Classification is empty.` };
        if (!institution) return { data: [], error: `Row ${i + 2}: Institution is empty.` };
        if (!asset) return { data: [], error: `Row ${i + 2}: Asset is empty.` };
        if (value === null) return { data: [], error: `Row ${i + 2}: invalid Value.` };

        out.push({
            Date: date,
            Classification: classification,
            Institution: institution,
            Asset: asset,
            Value: value,
        });
    }
    return { data: out };
}

// Force this route to never be cached by Next.js
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const fileExists = fs.existsSync(databasePath);
        if (!fileExists) {
            return NextResponse.json({ error: "Database not found" }, { status: 404 });
        }

        const rawContent = fs.readFileSync(databasePath, "utf-8");
        // Normalize line endings: convert all \r\n and lone \r to \n
        // This prevents ghost \r characters appearing in cell values that break date parsing
        const fileContent = rawContent.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

        // Auto-detect whether the CSV has a header row.
        // If the first line starts with a date pattern (digits/letters), treat as headerless.
        const firstLine = fileContent.split("\n")[0].trim();
        const looksLikeData = /^\d{1,2}\//.test(firstLine); // e.g. "01/Jan/22,..."

        let data: AssetEntry[];

        if (looksLikeData) {
            // No header — parse as array and map columns by position
            const parsed = Papa.parse(fileContent, {
                header: false,
                skipEmptyLines: true,
            });
            data = (parsed.data as string[][])
                .filter((row) => row.length >= 5 && !isNaN(Number(row[4])))
                .map((row) => ({
                    Date: row[0].trim(),
                    Classification: row[1].trim(),
                    Institution: row[2].trim(),
                    Asset: row[3].trim(),
                    Value: Number(row[4]),
                }));
        } else {
            // Has header row (Date, Classification, Asset, Value)
            const parsed = Papa.parse(fileContent, {
                header: true,
                skipEmptyLines: true,
            });
            data = (parsed.data as any[])
                .filter((row: any) => row.Date && row.Asset && !isNaN(Number(row.Value)))
                .map((row: any) => ({
                    Date: String(row.Date).trim(),
                    Classification: String(row.Classification).trim(),
                    Institution: String(row.Institution ?? "").trim(),
                    Asset: String(row.Asset).trim(),
                    Value: Number(row.Value),
                }));
        }

        data = data.filter((row) => row.Value !== 0);

        return NextResponse.json(data, {
            headers: {
                "Cache-Control": "no-store, max-age=0",
            },
        });
    } catch (error: any) {
        return NextResponse.json(
            { error: "Error reading database", details: error.message },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const contentType = request.headers.get("content-type") || "";

        if (contentType.includes("multipart/form-data")) {
            const formData = await request.formData();
            const file = formData.get("file") as File | null;
            if (!file) {
                return NextResponse.json({ errorCode: "NO_FILE" }, { status: 400 });
            }

            const originalName = file.name.toLowerCase();
            const bytes = Buffer.from(await file.arrayBuffer());
            let rows: Record<string, unknown>[] = [];
            let headers: string[] = [];

            if (originalName.endsWith(".csv")) {
                const text = bytes.toString("utf-8");
                const preview = Papa.parse<Record<string, unknown>>(text, {
                    preview: 1,
                    header: true,
                    skipEmptyLines: true,
                    transformHeader: (h) => h.trim(),
                });
                headers = (preview.meta?.fields || []).map((h: string) => h.trim());
                if (headers.length !== REQUIRED_COLUMNS.length) {
                    return NextResponse.json(
                        { errorCode: "COLUMN_COUNT", expected: REQUIRED_COLUMNS.length, received: headers.length },
                        { status: 400 }
                    );
                }
                const parsed = Papa.parse<Record<string, unknown>>(text, {
                    header: true,
                    skipEmptyLines: true,
                    transformHeader: (h) => h.trim(),
                });
                if (parsed.errors?.length) {
                    return NextResponse.json({ errorCode: "CSV_FORMAT" }, { status: 400 });
                }
                headers = (parsed.meta.fields || []).map((h) => h.trim());
                rows = parsed.data as Record<string, unknown>[];
            } else if (originalName.endsWith(".xlsx") || originalName.endsWith(".xls")) {
                const workbook = XLSX.read(bytes, { type: "buffer", cellDates: true });
                const firstSheetName = workbook.SheetNames[0];
                const firstSheet = workbook.Sheets[firstSheetName];
                if (!firstSheet) {
                    return NextResponse.json({ error: "Excel file has no sheets." }, { status: 400 });
                }

                const matrix = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(firstSheet, {
                    header: 1,
                    raw: true,
                    defval: null,
                });
                if (!matrix.length) {
                    return NextResponse.json({ error: "Excel file is empty." }, { status: 400 });
                }
                headers = (matrix[0] || []).map((v) => String(v ?? "").trim());
                const bodyRows = matrix.slice(1).filter((r) => r.some((v) => String(v ?? "").trim() !== ""));
                rows = bodyRows.map((r) => ({
                    Date: r[0],
                    Classification: r[1],
                    Institution: r[2],
                    Asset: r[3],
                    Value: r[4],
                }));
            } else {
                return NextResponse.json({ errorCode: "UNSUPPORTED_FILE_TYPE" }, { status: 400 });
            }

            const columnsError = validateColumns(headers);
            if (columnsError) {
                return NextResponse.json(columnsError, { status: 400 });
            }

            const normalized = normalizeRows(rows);
            if (normalized.error) {
                return NextResponse.json({ errorCode: "CSV_FORMAT" }, { status: 400 });
            }

            if (!normalized.data.length) {
                return NextResponse.json({ error: "Uploaded file has no valid data rows." }, { status: 400 });
            }

            fs.writeFileSync(databasePath, Papa.unparse(normalized.data), "utf-8");
            fs.writeFileSync(customClassPath, "Value\n", "utf-8");
            fs.writeFileSync(customAssetsPath, "Value\n", "utf-8");
            return NextResponse.json({ success: true, imported: normalized.data.length });
        }

        // Expects { action: 'append' | 'updateAll', data: AssetEntry | AssetEntry[] }
        const body = await request.json();

        if (!fs.existsSync(databasePath)) {
            return NextResponse.json({ error: "Database not found" }, { status: 404 });
        }

        let updatedCsv = "";

        if (body.action === "append") {
            const fileContent = fs.readFileSync(databasePath, "utf-8");
            // Detect the line ending used in the existing file (CRLF or LF)
            const lineEnding = fileContent.includes("\r\n") ? "\r\n" : "\n";
            // Strip any trailing whitespace/newlines from the file before appending
            const trimmedContent = fileContent.trimEnd();
            const newRow = `${lineEnding}${body.data.Date},${body.data.Classification},${body.data.Institution},${body.data.Asset},${body.data.Value}`;
            updatedCsv = trimmedContent + newRow;

        } else if (body.action === "updateAll") {
            updatedCsv = Papa.unparse({
                fields: ["Date", "Classification", "Institution", "Asset", "Value"],
                data: body.data
            }, {
                header: true
            });
            // Reset custom files to default headers when overwriting everything
            fs.writeFileSync(customClassPath, "Value\n", "utf-8");
            fs.writeFileSync(customAssetsPath, "Value\n", "utf-8");
        } else {
            return NextResponse.json({ error: "Invalid action" }, { status: 400 });
        }

        fs.writeFileSync(databasePath, updatedCsv, "utf-8");

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json(
            { error: "Error updating database", details: error.message },
            { status: 500 }
        );
    }
}
