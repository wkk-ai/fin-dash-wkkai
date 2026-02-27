import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import Papa from "papaparse";
import { AssetEntry } from "@/types/database";

const databasePath = path.resolve(
    process.cwd(),
    "../1. Database/Net Worth Database.csv"
);

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
                .filter((row) => row.length >= 4 && !isNaN(Number(row[3])))
                .map((row) => ({
                    Date: row[0].trim(),
                    Classification: row[1].trim(),
                    Asset: row[2].trim(),
                    Value: Number(row[3]),
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
                    Asset: String(row.Asset).trim(),
                    Value: Number(row.Value),
                }));
        }

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
            const newRow = `${lineEnding}${body.data.Date},${body.data.Classification},${body.data.Asset},${body.data.Value}`;
            updatedCsv = trimmedContent + newRow;

        } else if (body.action === "updateAll") {
            updatedCsv = Papa.unparse(body.data);
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
