/**
 * One-time migration script: CSV → Supabase
 *
 * Usage:
 *   1. Create a user in Supabase Dashboard → Authentication → Users → "Add user"
 *   2. Copy the user UUID from the dashboard
 *   3. Run: USER_ID=<uuid> node scripts/migrate-csv-to-supabase.mjs
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars
 * (service role key bypasses RLS so we can insert with a specific user_id)
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const USER_ID = process.env.USER_ID;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !USER_ID) {
  console.error(
    "Missing env vars. Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, USER_ID"
  );
  process.exit(1);
}

const headers = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=minimal",
};

function parseCSV(filePath) {
  try {
    const raw = readFileSync(filePath, "utf-8");
    const lines = raw.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];

    // Simple CSV parser (handles quoted fields with commas)
    const parseRow = (line) => {
      const result = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === "," && !inQuotes) {
          result.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
      result.push(current.trim());
      return result;
    };

    const hdrs = parseRow(lines[0]);
    return lines.slice(1).map((line) => {
      const vals = parseRow(line);
      const obj = {};
      hdrs.forEach((h, i) => {
        obj[h] = vals[i] || "";
      });
      return obj;
    });
  } catch {
    return [];
  }
}

async function insertBatch(table, rows, batchSize = 100) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers,
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`Error inserting into ${table} (batch ${i}):`, err);
      throw new Error(err);
    }
    inserted += batch.length;
  }
  return inserted;
}

async function main() {
  console.log("🚀 Starting CSV → Supabase migration");
  console.log(`   User ID: ${USER_ID}`);
  console.log(`   Supabase: ${SUPABASE_URL}\n`);

  // 1. Net Worth
  const netWorthRows = parseCSV(join(DATA_DIR, "net-worth.csv"));
  const netWorthData = netWorthRows
    .filter((r) => r.Date && r.Value)
    .map((r) => ({
      user_id: USER_ID,
      date: r.Date,
      classification: r.Classification || "",
      institution: r.Institution || "",
      asset: r.Asset || "",
      value: parseFloat(r.Value) || 0,
    }));
  const nwCount = await insertBatch("net_worth", netWorthData);
  console.log(`✅ net_worth: ${nwCount} rows inserted`);

  // 2. Movements
  const movRows = parseCSV(join(DATA_DIR, "movements.csv"));
  const movData = movRows
    .filter((r) => r.Date && r.Description)
    .map((r) => ({
      user_id: USER_ID,
      date: r.Date,
      description: r.Description || "",
      category: r.Category || "",
      type: r.Type || "Expense",
      value: parseFloat(r.Value) || 0,
    }));
  const movCount = await insertBatch("movements", movData);
  console.log(`✅ movements: ${movCount} rows inserted`);

  // 3. Budgets
  const budgetRows = parseCSV(join(DATA_DIR, "budgets.csv"));
  const budgetData = budgetRows
    .filter((r) => r.Category && r.Budget)
    .map((r) => ({
      user_id: USER_ID,
      category: r.Category,
      budget: parseFloat(r.Budget) || 0,
    }));
  const budgetCount = await insertBatch("budgets", budgetData);
  console.log(`✅ budgets: ${budgetCount} rows inserted`);

  // 4. Custom Tags (only if there's actual data)
  const tagFiles = [
    { file: "custom_classifications.csv", type: "classification" },
    { file: "custom_institutions.csv", type: "institution" },
    { file: "custom_assets.csv", type: "asset" },
    { file: "custom_income_categories.csv", type: "income_category" },
    { file: "custom_expense_categories.csv", type: "expense_category" },
  ];

  let tagCount = 0;
  for (const { file, type } of tagFiles) {
    const rows = parseCSV(join(DATA_DIR, file));
    const tags = rows
      .filter((r) => r.Value && r.Value.trim())
      .map((r) => ({
        user_id: USER_ID,
        tag_type: type,
        value: r.Value.trim(),
      }));
    if (tags.length > 0) {
      const count = await insertBatch("custom_tags", tags);
      tagCount += count;
      console.log(`✅ custom_tags (${type}): ${count} rows inserted`);
    }
  }

  console.log(`\n🎉 Migration complete!`);
  console.log(
    `   Total: ${nwCount} net_worth + ${movCount} movements + ${budgetCount} budgets + ${tagCount} custom_tags`
  );
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
