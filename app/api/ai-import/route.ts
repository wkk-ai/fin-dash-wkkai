import { NextResponse } from "next/server";
import Papa from "papaparse";

export const dynamic = "force-dynamic";

const OPENAI_MODELS = ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"];

function getApiConfig() {
    const apiKey = process.env.OPENAI_API_KEY || process.env.AI_API_KEY || "";
    const apiUrl = process.env.AI_API_URL || "https://api.openai.com/v1/chat/completions";
    const model = process.env.AI_MODEL || "gpt-4o-mini";
    return { apiKey, apiUrl, model };
}

// ─── Text Extraction ────────────────────────────────────────────────

async function extractTextFromFile(file: File): Promise<string> {
    const fileName = file.name.toLowerCase();
    const bytes = Buffer.from(await file.arrayBuffer());

    if (fileName.endsWith(".csv") || fileName.endsWith(".txt")) {
        return bytes.toString("utf-8");
    }

    if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(bytes, { type: "buffer", cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        return XLSX.utils.sheet_to_csv(sheet);
    }

    if (fileName.endsWith(".pdf")) {
        try {
            // Use community fork of pdf-parse that doesn't trigger DOMMatrix errors
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const pdfParse = require("pdf-parse-new");

            // Custom page renderer to ensure we don't hit Canvas APIs internally
            const pagerender = (pageData: any) => {
                return pageData.getTextContent({ normalizeWhitespace: true }).then((textContent: any) => {
                    return textContent.items.map((item: any) => item.str).join(" ");
                });
            };

            const pdfData = await pdfParse(bytes, { pagerender });
            const text = pdfData.text?.trim() || "";

            if (!text || text.length < 20) {
                throw new Error("Não foi possível extrair texto do PDF. O arquivo pode ser uma imagem escaneada. Tente converter para TXT ou CSV.");
            }
            return text;
        } catch (error: any) {
            console.error("PDF extraction error:", error);
            throw new Error(`Falha ao ler o PDF: ${error.message || "formato inválido"}`);
        }
    }

    throw new Error("Tipo de arquivo não suportado. Use CSV, TXT, XLS, XLSX ou PDF.");
}

// ─── Local Structured Parsing ───────────────────────────────────────
const MAX_ROWS = 50000;
const MAX_COLS = 6;

interface PatrimonioRow {
    Date: string;
    Classification: string;
    Asset: string;
    Value: number;
}

interface MovimentacaoRow {
    Date: string;
    Description: string;
    Category: string;
    Value: number;
}

function parseNumber(raw: string | number | undefined): number {
    if (typeof raw === "number") return raw;
    if (!raw) return 0;
    return parseFloat(String(raw).replace(/[^\d.,-]/g, "").replace(",", ".")) || 0;
}

function parseCustomDateStr(dateStr: string | undefined): string {
    if (!dateStr) return "";
    const cleanStr = String(dateStr).trim();
    
    // Check for weird format like Dec/28,/25
    const regexWeird = /^([A-Za-z]{3})\/(\d{1,2}),?\/(\d{2,4})$/;
    const matchWeird = cleanStr.match(regexWeird);
    if (matchWeird) {
        const monthStr = matchWeird[1].charAt(0).toUpperCase() + matchWeird[1].slice(1, 3).toLowerCase();
        const day = matchWeird[2].padStart(2, '0');
        let year = matchWeird[3];
        if (year.length === 2) year = "20" + year;
        return `${day}/${monthStr}/${year.slice(2)}`;
    }

    // Try to match DD/MM/YYYY or DD/MM/YY (like 31/01/2026 or 5/2/26)
    const regexDate = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/;
    const match = cleanStr.match(regexDate);
    
    if (match) {
        const day = match[1].padStart(2, '0');
        const monthNum = parseInt(match[2], 10);
        let year = match[3];
        if (year.length === 2) {
            year = "20" + year; // assume 2000s
        }
        
        const monthMap: Record<number, string> = {
            1: "Jan", 2: "Feb", 3: "Mar", 4: "Apr", 5: "May", 6: "Jun",
            7: "Jul", 8: "Aug", 9: "Sep", 10: "Oct", 11: "Nov", 12: "Dec"
        };
        const monthStr = monthMap[monthNum];
        if (monthStr) {
            return `${day}/${monthStr}/${year.slice(2)}`;
        }
    }
    
    // Already in DD/MMM/YYYY or DD/MMM/YY format? (like 01/Dec/25)
    const regexAlphaDate = /^(\d{1,2})[\/\-]([A-Za-z]{3,})[\/\-](\d{2,4})$/;
    const matchAlpha = cleanStr.match(regexAlphaDate);
    if (matchAlpha) {
         const day = matchAlpha[1].padStart(2, '0');
         const monthStr = matchAlpha[2].charAt(0).toUpperCase() + matchAlpha[2].slice(1, 3).toLowerCase();
         let year = matchAlpha[3];
         if (year.length === 2) {
             year = "20" + year; // assume 2000s
         }
         return `${day}/${monthStr}/${year.slice(2)}`;
    }

    return cleanStr;
}

function tryLocalParsePatrimonio(textContent: string): PatrimonioRow[] | null {
    const parsed = Papa.parse(textContent, { header: true, skipEmptyLines: true, transformHeader: (h: string) => h.trim() });
    if (!parsed.data || parsed.data.length === 0) return null;

    const rows = (parsed.data as any[]).map((r: any) => {
        const getV = (keys: string[]) => {
            const rowKeys = Object.keys(r);
            for (const key of keys) {
                const match = rowKeys.find(k => k.toLowerCase() === key.toLowerCase());
                if (match && r[match] !== undefined && r[match] !== "") return r[match];
            }
            return "";
        };
        return {
            Date: parseCustomDateStr(getV(["date", "data"]) as string),
            Classification: String(getV(["classification", "classificação", "classe", "class"])),
            Asset: String(getV(["asset", "ativo", "nome", "name"])),
            Value: parseNumber(getV(["value", "valor", "amount"])),
        };
    }).filter((r: any) => r.Date && r.Value);

    return rows.length > 0 ? rows : null;
}

function tryLocalParseMovimentacao(textContent: string): { rows: MovimentacaoRow[]; needsClassification: boolean } | null {
    const parsed = Papa.parse(textContent, { header: true, skipEmptyLines: true, transformHeader: (h: string) => h.trim() });
    if (!parsed.data || parsed.data.length === 0) return null;

    const rows = (parsed.data as any[]).map((r: any) => {
        const getV = (keys: string[]) => {
            const rowKeys = Object.keys(r);
            for (const key of keys) {
                const match = rowKeys.find(k => k.toLowerCase() === key.toLowerCase());
                if (match && r[match] !== undefined && r[match] !== "") return r[match];
            }
            return "";
        };
        return {
            Date: parseCustomDateStr(getV(["date", "data"]) as string),
            Description: String(getV(["description", "descrição", "desc"])),
            Category: String(getV(["category", "categoria"])),
            Value: parseNumber(getV(["value", "valor", "amount"])),
        };
    }).filter((r: any) => r.Date && r.Description);

    if (rows.length === 0) return null;

    const needsClassification = rows.some(r => !r.Category);
    return { rows, needsClassification };
}

// ─── AI Helpers ─────────────────────────────────────────────────────

function buildExtractionPrompt(type: string, content: string, settings: any): string {
    const existingClasses = settings.classifications?.join(", ") || "";
    const allCategories = [...(settings.incomeCategories || []), ...(settings.expenseCategories || [])].join(", ");

    if (type === "patrimonio") {
        return `You are a financial data extraction assistant. Analyze the following document and extract portfolio/asset data.

Return ONLY a valid JSON array. Each object must have:
- "Date": identify the format of the date string and convert it to "DD/Mon/YY" format (e.g. "06/Mar/26")
- "Classification": string (asset class). Use one of these existing classifications if it fits: [${existingClasses}]. If none fit, you may create a new one.
- "Asset": string (specific asset name or institution)
- "Value": number (positive, the current value)

IMPORTANT: Prioritize existing classifications [${existingClasses}] before creating new ones.
If the date is not clear, use today's date.
Do NOT include any explanation, markdown, or text outside the JSON array.

Document content:
${content}`;
    }

    return `You are a financial data extraction assistant. Analyze the following document and extract financial movement/transaction data.

Return ONLY a valid JSON array. Each object must have:
- "Date": identify the format of the date string and convert it to "DD/Mon/YY" format (e.g. "06/Mar/26")
- "Description": string (transaction description). Summarize the description.
- "Category": string. Use one of these existing categories if it fits: [${allCategories}]. If none fit, you may create a new one.
- "Value": number (negative for expenses, positive for income)

IMPORTANT: Prioritize existing categories [${allCategories}] before creating new ones.
Infer the category from the description/context. If the date is ambiguous, make your best guess.
Do NOT include any explanation, markdown, or text outside the JSON array.

Document content:
${content}`;
}

async function callOpenAI(prompt: string, systemMsg: string): Promise<any[] | null> {
    const { apiKey, apiUrl, model } = getApiConfig();
    if (!apiKey) return null;

    try {
        const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: "system", content: systemMsg },
                    { role: "user", content: prompt },
                ],
                temperature: 0.1,
            }),
        });

        if (!response.ok) {
            const err = await response.text();
            console.error("OpenAI API Error:", response.status, err);
            throw new Error(`OpenAI API Error (${response.status}): ${err}`);
        }

        const data = await response.json();
        let rawContent = data.choices?.[0]?.message?.content || "";
        rawContent = rawContent.trim();

        // Better JSON extraction: find the first '[' and last ']'
        const startIdx = rawContent.indexOf('[');
        const endIdx = rawContent.lastIndexOf(']');

        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
            rawContent = rawContent.substring(startIdx, endIdx + 1);
        } else if (rawContent.startsWith("```")) {
            rawContent = rawContent.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
        }

        const parsed = JSON.parse(rawContent);
        if (!Array.isArray(parsed)) {
            throw new Error("A IA não retornou um array JSON válido.");
        }
        return parsed;
    } catch (err: any) {
        console.error("OpenAI call/parse failed:", err);
        throw new Error(`Falha no processamento da IA: ${err.message}`);
    }
}

async function classifyCategories(rows: MovimentacaoRow[]): Promise<MovimentacaoRow[]> {
    const uncategorized = rows.filter(r => !r.Category);
    if (uncategorized.length === 0) return rows;

    const settings = await getExistingCategories();
    const allCategories = [...(settings.incomeCategories || []), ...(settings.expenseCategories || [])].join(", ");

    const categoryMap = new Map<number, string>();
    const CHUNK_SIZE = 100;
    const promises = [];

    for (let i = 0; i < uncategorized.length; i += CHUNK_SIZE) {
        const chunk = uncategorized.slice(i, i + CHUNK_SIZE);
        const descriptions = chunk.map((r, idx) => `${i + idx}: ${r.Description}`).join("\n");

        const prompt = `Classify each transaction description into one of these categories. 
PRIORITIZE these existing categories if they fit: [${allCategories}]. 
If none fit, you may use standard ones like: Alimentação, Transporte, Moradia, Saúde, Educação, Lazer, Compras, Serviços, Salário, Investimento, Transferência, Outros.

Return ONLY a JSON array of objects with "index" (number) and "category" (string).

Descriptions:
${descriptions}`;

        promises.push(
            callOpenAI(prompt, "You are a financial transaction classifier. Respond only with valid JSON.")
                .then(result => {
                    if (result) {
                        for (const item of result) {
                            if (typeof item.index === "number" && typeof item.category === "string") {
                                categoryMap.set(item.index, item.category);
                            }
                        }
                    }
                }).catch(err => {
                    console.error("Chunk classification failed for chunk starting at", i, err);
                })
        );
    }

    await Promise.all(promises);

    let uncatIdx = 0;
    return rows.map(r => {
        if (!r.Category) {
            const cat = categoryMap.get(uncatIdx);
            uncatIdx++;
            return { ...r, Category: cat || "Outros" };
        }
        return r;
    });
}

// ─── Main Handler ───────────────────────────────────────────────────

async function getExistingCategories() {
    try {
        const fs = await import("fs/promises");
        const path = await import("path");
        const filePath = path.join(process.cwd(), "data", "settings.json");
        
        try {
            await fs.access(filePath);
        } catch {
            return { classifications: [], incomeCategories: [], expenseCategories: [] };
        }
        
        const fileContent = await fs.readFile(filePath, "utf-8");
        return JSON.parse(fileContent);
    } catch (e) {
        console.error("Error reading settings for AI prompt:", e);
        return { classifications: [], incomeCategories: [], expenseCategories: [] };
    }
}

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        const type = formData.get("type") as string;

        if (!file) {
            return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
        }

        if (!type || !["patrimonio", "movimentacao"].includes(type)) {
            return NextResponse.json({ error: "Tipo de importação inválido." }, { status: 400 });
        }

        if (file.size > 10 * 1024 * 1024) {
            return NextResponse.json({ error: "Arquivo excede o tamanho máximo de 10MB." }, { status: 400 });
        }

        // Step 1: Extract text from file
        const textContent = await extractTextFromFile(file);
        if (!textContent || textContent.trim().length === 0) {
            return NextResponse.json({ error: "Não foi possível extrair conteúdo do arquivo." }, { status: 400 });
        }

        // Step 1b: Validate CSV constraints (rows, cols) and detect incorrect file types
        if (file.name.toLowerCase().endsWith(".csv") || file.name.toLowerCase().endsWith(".txt")) {
            const parsedMeta = Papa.parse(textContent, { header: true, skipEmptyLines: true });
            if (parsedMeta.data && parsedMeta.data.length > 0) {
                if (parsedMeta.data.length > MAX_ROWS) {
                    return NextResponse.json({ error: `O arquivo tem muitas linhas (${parsedMeta.data.length}). O limite é de ${MAX_ROWS} linhas.` }, { status: 400 });
                }
                
                const headers = parsedMeta.meta.fields || [];
                if (headers.length > MAX_COLS) {
                    return NextResponse.json({ error: `O arquivo tem muitas colunas (${headers.length}). O limite é de ${MAX_COLS} colunas. Por favor, simplifique o arquivo.` }, { status: 400 });
                }

                const headerStr = headers.join(" ").toLowerCase();
                const hasPatrimonioKeywords = headerStr.includes("asset") || headerStr.includes("ativo") || headerStr.includes("classificação") || headerStr.includes("classification");
                const hasMovimentacaoKeywords = headerStr.includes("description") || headerStr.includes("descrição") || headerStr.includes("category") || headerStr.includes("categoria");

                if (type === "movimentacao" && hasPatrimonioKeywords && !hasMovimentacaoKeywords) {
                    return NextResponse.json({ error: "Parece que você de enviou um arquivo de Patrimônio (ativos/classificação) selecionando a opção de Movimentação. Por favor, tente novamente selecionando a opção 'Patrimônio / Asset'." }, { status: 400 });
                }
                if (type === "patrimonio" && hasMovimentacaoKeywords && !hasPatrimonioKeywords) {
                    return NextResponse.json({ error: "Parece que você de enviou um arquivo de Movimentação (descrição/categoria) selecionando a opção de Patrimônio. Por favor, tente novamente selecionando a opção 'Movimentação'." }, { status: 400 });
                }
            }
        }

        // Step 2: Try local structured parsing first (no API call)
        if (type === "patrimonio") {
            const localRows = tryLocalParsePatrimonio(textContent);
            if (localRows && localRows.length > 0) {
                console.log(`[AI Import] Patrimônio parsed locally: ${localRows.length} rows (no API call)`);
                return NextResponse.json({ rows: localRows, source: "local" });
            }
        } else {
            const localResult = tryLocalParseMovimentacao(textContent);
            if (localResult && localResult.rows.length > 0) {
                let { rows, needsClassification } = localResult;
                if (needsClassification) {
                    console.log(`[AI Import] Movimentação parsed locally, classifying ${rows.filter(r => !r.Category).length} items via API...`);
                    rows = await classifyCategories(rows);
                    return NextResponse.json({ rows, source: "local+ai-classify" });
                }
                console.log(`[AI Import] Movimentação parsed locally: ${rows.length} rows (no API call)`);
                return NextResponse.json({ rows, source: "local" });
            }
        }

        // Step 3: Local parse failed (e.g. unstructured PDF) — use AI for full extraction
        console.log(`[AI Import] Local parse failed, using AI for full extraction...`);
        const { apiKey } = getApiConfig();
        if (!apiKey) {
            return NextResponse.json({
                error: "Não foi possível extrair dados estruturados do arquivo. Para processar arquivos não-estruturados (como PDFs), configure OPENAI_API_KEY em .env.local."
            }, { status: 400 });
        }

        const maxChars = 15000;
        const truncatedContent = textContent.length > maxChars
            ? textContent.substring(0, maxChars) + "\n... [truncated]"
            : textContent;

        const settings = await getExistingCategories();
        const prompt = buildExtractionPrompt(type, truncatedContent, settings);
        const aiRows = await callOpenAI(prompt, "You are a precise data extraction assistant. You only respond with valid JSON arrays. Never include markdown formatting or explanations.");

        if (!aiRows || aiRows.length === 0) {
            return NextResponse.json({
                error: "Não foi possível extrair dados do arquivo. Verifique se o formato está correto ou tente converter para CSV."
            }, { status: 400 });
        }

        return NextResponse.json({ rows: aiRows, source: "ai" });

    } catch (error: any) {
        console.error("AI Import Error:", error);
        return NextResponse.json(
            { error: error.message || "Erro ao processar arquivo." },
            { status: 500 }
        );
    }
}
