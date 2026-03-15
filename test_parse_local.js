const fs = require('fs');
const Papa = require('papaparse');

function parseNumber(raw) {
    if (typeof raw === "number") return raw;
    if (!raw) return 0;
    return parseFloat(String(raw).replace(/[^\d.,-]/g, "").replace(",", ".")) || 0;
}

function parseCustomDateStr(dateStr) {
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
        
        const monthMap = {
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

function tryLocalParseMovimentacao(textContent) {
    const parsed = Papa.parse(textContent, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() });
    if (!parsed.data || parsed.data.length === 0) return null;

    const firstRow = parsed.data[0];
    const headers = Object.keys(firstRow).map(h => h.toLowerCase());

    const hasDate = headers.some(h => ["date", "data"].includes(h));
    const hasDesc = headers.some(h => ["description", "descrição", "desc", "historico", "histórico"].includes(h));
    const hasValue = headers.some(h => ["value", "valor", "amount", "quantia"].includes(h));

    if (!hasDate || !hasDesc || !hasValue) {
        return null; // Local parsing failed, likely unstructured
    }

    return parsed.data.map((row, i) => {
        const getV = (keys) => {
            const h = Object.keys(row).find(k => keys.includes(k.toLowerCase().trim()));
            return h ? row[h] : undefined;
        };
        return {
            Date: parseCustomDateStr(getV(["date", "data"])),
            Description: String(getV(["description", "descrição", "desc"])),
            Category: String(getV(["category", "categoria"])),
            Value: parseNumber(getV(["value", "valor", "amount"])),
        };
    }).filter((r) => r.Date && r.Description);
}

const csv = fs.readFileSync('movements original.csv', 'utf8');
const result = tryLocalParseMovimentacao(csv);
console.log(result ? result.slice(0, 5) : "NULL");
