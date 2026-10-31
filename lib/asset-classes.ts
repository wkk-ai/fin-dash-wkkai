/**
 * One look per asset type (icon + colour), shared by the Net Worth page and the Dashboard donut,
 * so "Renda Fixa" is always the same colour everywhere and colour never depends on ranking.
 *
 * Colours are a colour-blind-checked categorical palette (separate steps for light and dark).
 * Red is deliberately not used: it stays reserved for losses and overspending.
 */

type Slot = { light: string; dark: string; order: number };

// Six hues in a fixed order. Charts draw types in this order (not by size), so every pair of
// neighbouring colours - including last-to-first around a donut - passes the colour-blind check
// in both light and dark mode. More than six types share hues; the icon and label tell them apart.
const PALETTE = {
    blue: { light: "#2a78d6", dark: "#3987e5", order: 0 },
    orange: { light: "#eb6834", dark: "#d95926", order: 1 },
    aqua: { light: "#1baf7a", dark: "#199e70", order: 2 },
    yellow: { light: "#eda100", dark: "#c98500", order: 3 },
    violet: { light: "#6250d6", dark: "#9085e9", order: 4 },
    magenta: { light: "#e87ba4", dark: "#d55181", order: 5 },
} satisfies Record<string, Slot>;

type Rule = { match: RegExp; icon: string; slot: Slot };

// Order matters: the first rule whose pattern matches the type name wins.
const RULES: Rule[] = [
    { match: /t[ií]tulo|tesouro|p[uú]blico|government|treasury/i, icon: "account_balance", slot: PALETTE.aqua },
    { match: /previd|pgbl|vgbl|aposent|pension|retire/i, icon: "beach_access", slot: PALETTE.magenta },
    { match: /cripto|crypto|bitcoin|btc/i, icon: "currency_bitcoin", slot: PALETTE.yellow },
    { match: /\bfii|imobili|real estate|reit/i, icon: "apartment", slot: PALETTE.orange },
    { match: /internac|exterior|global|offshore|d[oó]lar|usd|international/i, icon: "public", slot: PALETTE.violet },
    { match: /vari[aá]vel|a[çc][õo]es|equit|stock|bolsa|renta variable/i, icon: "candlestick_chart", slot: PALETTE.violet },
    { match: /fgts/i, icon: "work", slot: PALETTE.orange },
    { match: /reserva|caixa|conta|cash|emerg|liquidez/i, icon: "account_balance_wallet", slot: PALETTE.blue },
    { match: /fixa|fixed|cdb|lci|lca|deb[eê]nt|renta fija/i, icon: "savings", slot: PALETTE.blue },
];

const FALLBACK_SLOTS: Slot[] = Object.values(PALETTE);

function hash(text: string): number {
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
    return h;
}

export type AssetClassStyle = { icon: string; color: string; order: number };

export function getAssetClassStyle(name: string, isDark: boolean): AssetClassStyle {
    const rule = RULES.find((r) => r.match.test(name));
    // Unknown types still get a stable colour from their name, never from their position in a list.
    const slot = rule?.slot ?? FALLBACK_SLOTS[hash(name.trim().toLowerCase()) % FALLBACK_SLOTS.length];
    return { icon: rule?.icon ?? "category", color: isDark ? slot.dark : slot.light, order: slot.order };
}

/** Sort helper: palette order first, then name, so chart neighbours always have tested colour pairs. */
export function byAssetClassOrder(a: string, b: string): number {
    const oa = getAssetClassStyle(a, true).order;
    const ob = getAssetClassStyle(b, true).order;
    return oa - ob || a.localeCompare(b);
}
