/* Ações Baratas — state, formatting, shared vocabulary. Data: data/*.json (built daily by pipeline/run.py). */
"use strict";
const $ = (s, el = document) => el.querySelector(s);
let app = null; // set by StocksApp.start()
const BASE = window.__STOCKS_BASE || "";
const alive = () => !!app && document.body.contains(app);

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const S = {
  stocks: [], meta: {}, series: {}, hist: {}, prices: {}, bySector: {}, byTicker: {},
  market: store.get("market", "BR"), favs: new Set(store.get("favs", [])),
  ex: { q: "", sector: "", verdicts: [], preset: "", sort: ["final_score", -1], shown: 60 },
  map: { preset: "matriz", x: "value_score", y: "quality_score" },
};

// ---------- formatting ----------
const nf = (d) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const NF = [nf(0), nf(1), nf(2)];
const isNum = (v) => typeof v === "number" && isFinite(v);
const x = (v, d = 1) => (isNum(v) ? NF[d].format(v) : "–");
const pct = (v, d = 1) => (isNum(v) ? NF[d].format(v * 100) + "%" : "–");
const spct = (v, d = 0) => (isNum(v) ? (v > 0 ? "+" : "") + pct(v, d) : "–");
const money = (v, cur) => (isNum(v) ? (cur === "USD" ? "US$ " : "R$ ") + NF[2].format(v) : "–");
const big = (v, cur) => {
  if (!isNum(v)) return "–";
  const p = cur === "USD" ? "US$ " : "R$ ", a = Math.abs(v);
  if (a >= 1e12) return p + NF[1].format(v / 1e12) + " tri";
  if (a >= 1e9) return p + NF[1].format(v / 1e9) + " bi";
  if (a >= 1e6) return p + NF[1].format(v / 1e6) + " mi";
  return p + NF[0].format(v);
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const median = (arr) => { const a = arr.filter(isNum).sort((p, q) => p - q); if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const quantile = (sorted, q) => { if (!sorted.length) return null; const i = (sorted.length - 1) * q, lo = Math.floor(i); return sorted[lo] + (sorted[Math.min(sorted.length - 1, lo + 1)] - sorted[lo]) * (i - lo); };
const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const fmtDate = (d, full) => { const [y, m, dd] = d.split("-"); return full ? `${dd}/${m}/${y}` : `${MES[+m - 1]}/${y.slice(2)}`; };

// ---------- vocabulary ----------
const VERDICTS = {
  oportunidade: { l: "Barata e boa", pl: "baratas e boas", d: "Múltiplos baixos contra o setor, retorno acima do custo de capital, sem alerta grave e a maioria dos sinais a favor." },
  barata_risco: { l: "Barata, com risco", pl: "baratas, com risco", d: "Múltiplos baixos, mas falha em qualidade, dívida ou algum alerta grave. É onde moram as armadilhas de valor." },
  boa_cara: { l: "Boa, mas cara", pl: "boas, mas caras", d: "Empresa de qualidade negociada a múltiplos altos contra o setor." },
  neutra: { l: "Neutra", pl: "neutras", d: "Nem barata nem especialmente boa pelos indicadores." },
  evitar: { l: "Evitar", pl: "para evitar", d: "Cara e fraca, com prejuízo ou com patrimônio negativo." },
};
const VORDER = ["oportunidade", "barata_risco", "boa_cara", "neutra", "evitar"];
const vcolor = (v) => `var(--v-${v})`;
const vdot = (v) => `<i class="vdot${v === "evitar" ? " hollow" : ""}" style="--c:${vcolor(v)}"></i>`;
const pill = (v, bigger) => `<span class="pill${bigger ? " big" : ""}">${vdot(v)}${VERDICTS[v] ? VERDICTS[v].l : ""}</span>`;

const SIGNALS = {
  barata_setor: "Barata contra o setor", rend_lucro: "Lucro rende mais que a renda fixa", graham: "Abaixo do número de Graham",
  pl_normal: "P/L moderado no lucro de 3 anos", rentavel: "Retorno acima do custo de capital", divida: "Dívida sob controle",
  estavel: "Lucro todo ano", caixa: "Lucro vira caixa", dividendos: "Dividendos consistentes", tendencia: "Preço em tendência de alta",
};
const SIG_NEG = {
  barata_setor: "Não está barata contra o setor", rend_lucro: "Lucro rende menos que a renda fixa", graham: "Acima do número de Graham",
  pl_normal: "P/L alto no lucro de 3 anos", rentavel: "Retorno abaixo do custo de capital", divida: "Dívida pesada",
  estavel: "Teve ano de prejuízo", caixa: "Lucro não vira caixa", dividendos: "Dividendos fracos ou irregulares", tendencia: "Preço em tendência de queda",
};
const sigName = (g) => (g[1] === false ? SIG_NEG : SIGNALS)[g[0]];
const SIG_PRIORITY = ["rend_lucro", "rentavel", "barata_setor", "divida", "graham", "estavel", "caixa", "dividendos", "pl_normal", "tendencia"];
const FLAGS = {
  lucro_negativo: ["Prejuízo", "Lucro negativo nos últimos 12 meses: P/L não tem significado.", 1],
  patrimonio_negativo: ["Patrimônio negativo", "A empresa deve mais do que tem.", 1],
  divida_alta: ["Dívida alta", "Dívida líquida acima de 4 vezes o EBITDA.", 1],
  cobertura_baixa: ["Juros pesados", "O lucro operacional cobre os juros menos de 2 vezes.", 1],
  pico_ciclo: ["Pico do ciclo", "Margem atual mais de 30% acima da média de vários anos em setor cíclico: o lucro pode cair.", 1],
  pl_muito_baixo: ["P/L abaixo de 3", "P/L muito baixo costuma vir de lucro não recorrente, como venda de ativo ou crédito fiscal.", 0],
  dy_atipico: ["Dividendo atípico", "Dividend yield acima de 15%: provável pagamento extraordinário ou queda forte do preço.", 0],
  liquidez_corrente_baixa: ["Liquidez curta", "O que entra em 12 meses não cobre o que vence em 12 meses.", 0],
  roe_alavancado: ["ROE inflado", "ROE acima de 60% costuma vir de dívida ou patrimônio pequeno, não de eficiência.", 0],
  receita_caindo: ["Receita caindo", "Receita encolhendo: risco de declínio estrutural.", 0],
  retorno_abaixo_custo: ["Retorno abaixo do custo", "Retorno sobre o capital abaixo do custo de capital (perto de 13% no Brasil e 8% nos EUA). Múltiplo baixo com retorno baixo costuma ser merecido.", 0],
  lucro_sem_caixa: ["Lucro sem caixa", "Em 3 anos, o caixa da operação foi menos da metade do lucro contábil.", 0],
  prejuizo_recente: ["Prejuízo recente", "Teve prejuízo em pelo menos um dos últimos 5 anos.", 0],
  ciclica: ["Cíclica", "Setor cíclico ou de commodity: o lucro atual pode estar no pico do ciclo.", 0],
};
const DIMS = [["valor", "Valor"], ["rentabilidade", "Rentabilidade"], ["seguranca", "Segurança"], ["estabilidade", "Estabilidade"], ["tendencia", "Tendência"]];

// Metrics that can sit on a chart axis. dom = fixed domain; otherwise the 2nd-98th percentile is used and outliers sit on the edge.
const METRICS = {
  value_score: { l: "Valor", hint: "mais barata", f: (v) => x(v, 0), dom: [0, 100] },
  quality_score: { l: "Qualidade", hint: "melhor", f: (v) => x(v, 0), dom: [0, 100] },
  final_score: { l: "Score final", hint: "melhor", f: (v) => x(v, 0), dom: [0, 100] },
  sig: { l: "Sinais a favor", get: (s) => (s.sig_total ? s.sig_ok / s.sig_total : null), f: (v) => pct(v, 0), dom: [0, 1] },
  ey: { l: "Rendimento do lucro operacional (EBIT ÷ valor da firma)", short: "EBIT ÷ EV", get: (s) => (s.ev_ebit > 0 ? 1 / s.ev_ebit : null), f: (v) => pct(v, 0) },
  pe: { l: "P/L", get: (s) => (s.pe > 0 ? s.pe : null), f: (v) => x(v) },
  pe_avg3: { l: "P/L no lucro médio de 3 anos", get: (s) => (s.pe_avg3 > 0 ? s.pe_avg3 : null), f: (v) => x(v) },
  pb: { l: "P/VP", get: (s) => (s.pb > 0 ? s.pb : null), f: (v) => x(v, 2) },
  dy: { l: "Dividend yield", f: (v) => pct(v) },
  roic: { l: "ROIC", f: (v) => pct(v, 0) },
  roe: { l: "ROE", f: (v) => pct(v, 0) },
  ebit_margin: { l: "Margem EBIT", f: (v) => pct(v, 0) },
  net_debt_ebitda: { l: "Dívida líquida ÷ EBITDA", f: (v) => x(v) },
  ret_12m: { l: "Retorno do preço em 12 meses", f: (v) => spct(v) },
  vs_ma200: { l: "Preço contra a média de 200 dias", f: (v) => spct(v) },
  graham_gap: { l: "Desconto para o número de Graham", get: (s) => (s.graham_value > 0 && s.price > 0 ? 1 - s.price / s.graham_value : null), f: (v) => pct(v, 0) },
};
const mget = (key, s) => { const m = METRICS[key]; const v = m.get ? m.get(s) : s[key]; return isNum(v) ? v : null; };

// ---------- data ----------
const inMarket = (list = S.stocks) => (S.market === "ALL" ? list : list.filter((s) => s.market === S.market));
const ret = (s) => (s.is_financial ? s.roe : s.roic);
const peersOf = (s) => { const p = S.bySector[s.market + "|" + s.sector] || []; return p.length >= 5 ? p : S.stocks.filter((v) => v.market === s.market); };
const byScore = (a, b) => (b.final_score || 0) - (a.final_score || 0);
const marketName = () => ({ BR: "brasileiras", US: "americanas", ALL: "" }[S.market]);
const rf = (mkt) => { const m = S.meta.macro || {}; return mkt === "US" ? m.us10y : m.selic; };
const sigOf = (s, id) => (s.signals || []).find((g) => g[0] === id);
const pros = (s, n = 3) => SIG_PRIORITY.map((id) => sigOf(s, id)).filter((g) => g && g[1] === true).slice(0, n);
const cons = (s, n = 2) => {
  const out = Object.keys(FLAGS).filter((f) => (s.flags || []).includes(f) && FLAGS[f][2]).map((f) => [FLAGS[f][0], FLAGS[f][1]]);
  for (const id of SIG_PRIORITY) { const g = sigOf(s, id); if (g && g[1] === false) out.push([SIG_NEG[id], g[2]]); }
  return out.slice(0, n);
};
/** Percentile (0-100, higher = better) of a stock's metric among its peers. */
function pctRank(s, key, dir) {
  const v = mget(key, s); if (v === null) return null;
  const vals = peersOf(s).map((p) => mget(key, p)).filter((q) => q !== null);
  if (vals.length < 3) return null;
  const below = vals.filter((q) => q < v).length + vals.filter((q) => q === v).length / 2;
  const p = (below / vals.length) * 100;
  return dir === "low" ? 100 - p : p;
}

let loading = false;
async function load() {
  if (loading) return; loading = true;
  const get = (u) => fetch(u, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [stocks, meta, hist, series] = await Promise.all([get(BASE + "data/stocks.json"), get(BASE + "data/meta.json"), get(BASE + "data/history.json"), get(BASE + "data/series.json")]);
  S.stocks = stocks || []; S.meta = meta || {}; S.hist = hist || {}; S.series = series || {};
  for (const s of S.stocks) { (S.bySector[s.market + "|" + s.sector] ||= []).push(s); S.byTicker[s.ticker] = s; }
  if (S.meta.generated_at && $("#stk-stamp")) $("#stk-stamp").textContent = "Atualizado em " + new Date(S.meta.generated_at).toLocaleString("pt-BR") + ".";
  enrich(); route();
}

// ---------- tooltip ----------
const tipEl = document.createElement("div"); tipEl.className = "stk-tip"; document.body.appendChild(tipEl);
function showTip(html, ev) {
  tipEl.innerHTML = html; tipEl.style.display = "block";
  const p = ev.touches ? ev.touches[0] : ev, tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
  tipEl.style.left = Math.min(window.innerWidth - tw - 8, Math.max(8, p.clientX + 14)) + "px";
  tipEl.style.top = (p.clientY - th - 12 < 8 ? p.clientY + 18 : p.clientY - th - 12) + "px";
}
function hideTip() { tipEl.style.display = "none"; }
const stockTip = (s) => `<b>${esc(s.ticker)}</b> <span class="m">${esc(s.name !== s.ticker ? s.name : "")}</span><br>${VERDICTS[s.verdict].l} · score ${x(s.final_score, 0)}<br>` +
  `Valor ${x(s.value_score, 0)} · Qualidade ${x(s.quality_score, 0)}<br>P/L ${s.pe > 0 ? x(s.pe) : "–"} · DY ${pct(s.dy)} · ${s.is_financial ? "ROE" : "ROIC"} ${pct(ret(s), 0)}<br>` +
  `<span class="m">${s.sig_ok} de ${s.sig_total} sinais a favor · ${esc(s.sector || "")}</span>`;
document.addEventListener("mousemove", (ev) => {
  if (!alive()) { hideTip(); return; }
  const t = ev.target.closest && ev.target.closest("[data-tip],[data-st]");
  if (!t) { if (!(ev.target.closest && ev.target.closest("svg.pchart"))) hideTip(); return; }
  if (t.dataset.st) { const s = S.byTicker[t.dataset.st]; if (s) showTip(stockTip(s), ev); return; }
  showTip(t.getAttribute("data-tip"), ev);
});

// ---------- mounting charts that need the container width ----------
let mounts = [];
function mount(id, fn) {
  const el = document.getElementById(id); if (!el) return;
  const draw = () => { el.innerHTML = fn(Math.max(280, el.clientWidth)); };
  draw(); mounts.push(draw);
}
let rz; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (alive()) mounts.forEach((d) => d()); }, 150); });

// ---------- global filters (apply to every chart and list) ----------
const F0 = () => ({ q: "", sector: "", verdicts: [], size: "", dy: 0, pe: 0, ret: 0, debt: 0, sig: 0, favs: false, nofin: false, nograve: false, up: false });
S.f = Object.assign(F0(), store.get("filters", {}), { q: "" });
S.fopen = false;
const saveF = () => store.set("filters", S.f);
const GRAVE = ["lucro_negativo", "patrimonio_negativo", "divida_alta", "cobertura_baixa", "pico_ciclo"];
const FSEL = {
  dy: ["Dividend yield mínimo", [[0, "Qualquer"], [0.02, "2%"], [0.04, "4%"], [0.06, "6%"], [0.08, "8%"]]],
  pe: ["P/L máximo", [[0, "Qualquer"], [5, "5"], [10, "10"], [15, "15"], [20, "20"]]],
  ret: ["Retorno mínimo (ROIC ou ROE)", [[0, "Qualquer"], [0.1, "10%"], [0.15, "15%"], [0.2, "20%"]]],
  debt: ["Dívida líquida ÷ EBITDA máxima", [[0, "Qualquer"], [1, "1×"], [2, "2×"], [3, "3×"]]],
  sig: ["Sinais a favor, no mínimo", [[0, "Qualquer"], [0.5, "50%"], [0.6, "60%"], [0.8, "80%"]]],
};
const FTOG = { favs: "Só favoritos ★", nofin: "Sem bancos e seguradoras", nograve: "Sem alerta grave", up: "Só em tendência de alta" };
const FSIZE = { "": "Todos os tamanhos", G: "Grandes", M: "Médias", P: "Pequenas" };
function passF(s) {
  const f = S.f, q = f.q.trim().toLowerCase();
  if (q && !(s.ticker.toLowerCase().includes(q) || (s.name || "").toLowerCase().includes(q))) return false;
  if (f.sector && s.sector !== f.sector) return false;
  if (f.verdicts.length && !f.verdicts.includes(s.verdict)) return false;
  if (f.size && s.size !== f.size) return false;
  if (f.dy && !(s.dy >= f.dy)) return false;
  if (f.pe && !(s.pe > 0 && s.pe <= f.pe)) return false;
  if (f.ret && !(ret(s) >= f.ret)) return false;
  if (f.debt && !s.is_financial && !(isNum(s.net_debt_ebitda) && s.net_debt_ebitda <= f.debt)) return false;
  if (f.sig && !(s.sig_total && s.sig_ok / s.sig_total >= f.sig)) return false;
  if (f.favs && !S.favs.has(s.ticker)) return false;
  if (f.nofin && s.is_financial) return false;
  if (f.nograve && (s.flags || []).some((x) => GRAVE.includes(x))) return false;
  if (f.up && !(s.vs_ma200 >= 0)) return false;
  return true;
}
const filtered = () => inMarket().filter(passF);
const nFilters = () => { const f = S.f, z = F0(); return Object.keys(z).filter((k) => (Array.isArray(z[k]) ? f[k].length : f[k] !== z[k])).length; };

// ---------- numbers derived once, after load ----------
function enrich() {
  for (const mkt of ["BR", "US"]) {
    const l = S.stocks.filter((s) => s.market === mkt && isNum(s.market_cap)).sort((a, b) => b.market_cap - a.market_cap);
    l.forEach((s, i) => { s.size = i < l.length / 3 ? "G" : i < (2 * l.length) / 3 ? "M" : "P"; });
  }
  for (const s of S.stocks) {
    s.payout = s.eps > 0 && isNum(s.dps) ? s.dps / s.eps : null;
    s.drawdown = s.hi_52w > 0 && s.price > 0 ? Math.min(0, s.price / s.hi_52w - 1) : null;
    const r = rf(s.market); s.ey_gap = s.pe > 0 && isNum(r) ? 1 / s.pe - r : null;
    s.implied_g = s.pe > 0 ? (s.pe - 8.5) / 200 : null;
    const ser = S.series[s.ticker] || [], last = ser[ser.length - 1], old = last && ser.find((q) => q[0] === last[0] - 5);
    const cagr = (i) => (last && old && last[i] > 0 && old[i] > 0 ? Math.pow(last[i] / old[i], 0.2) - 1 : null);
    s.ni_cagr5 = cagr(1); s.rev_cagr5 = cagr(2);
    s.div_share = s.hist_years > 0 && isNum(s.div_years) ? Math.min(1, s.div_years / s.hist_years) : null;
    const h = S.hist[s.ticker] || []; s.d_score = h.length > 1 ? h[h.length - 1][1] - h[0][1] : null;
  }
}
Object.assign(METRICS, {
  ev_ebit: { l: "EV/EBIT", get: (s) => (s.ev_ebit > 0 ? s.ev_ebit : null), f: (v) => x(v) },
  payout: { l: "Payout (dividendo ÷ lucro)", short: "Payout", f: (v) => pct(v, 0), dom: [0, 2] },
  div_share: { l: "Anos em que pagou dividendo", short: "Anos pagando", f: (v) => pct(v, 0), dom: [0, 1] },
  drawdown: { l: "Queda desde a máxima de 52 semanas", short: "Queda desde a máxima", f: (v) => pct(v, 0) },
  pos_52w: { l: "Posição na faixa de 52 semanas", f: (v) => pct(v, 0), dom: [0, 1] },
  mcap: { l: "Valor de mercado (escala log)", short: "Valor de mercado", get: (s) => (s.market_cap > 0 ? Math.log10(s.market_cap) : null), f: (v) => { const b = Math.pow(10, v) / 1e9; return NF[b < 10 ? 1 : 0].format(b) + " bi"; } },
  ni_cagr5: { l: "Crescimento do lucro em 5 anos (ao ano)", short: "Cresc. do lucro 5a", f: (v) => spct(v) },
  rev_cagr5: { l: "Crescimento da receita em 5 anos (ao ano)", short: "Cresc. da receita 5a", f: (v) => spct(v) },
  ey_gap: { l: "Prêmio do lucro sobre a renda fixa", short: "Prêmio sobre renda fixa", f: (v) => (isNum(v) ? (v > 0 ? "+" : "") + NF[1].format(v * 100) + " p.p." : "–") },
});
const GLOSS = {
  pe: "Preço ÷ lucro por ação. Quantos anos de lucro você paga. Menor é mais barato.", pe_avg3: "Preço ÷ lucro médio de 3 anos. Suaviza um ano fora da curva.",
  pb: "Preço ÷ valor patrimonial por ação. Abaixo de 1, paga menos que o patrimônio contábil.", ev_ebit: "Valor da firma (ações + dívida líquida) ÷ lucro operacional. Compara empresas com dívidas diferentes.",
  ev_ebitda: "Valor da firma ÷ EBITDA.", ps: "Preço ÷ receita por ação.", dy: "Dividendos dos últimos 12 meses ÷ preço.", payout: "Parte do lucro paga em dividendos. Acima de 100% não se sustenta.",
  ret: "ROIC (ROE para bancos): quanto o negócio rende sobre o capital investido.", ebit_margin: "Lucro operacional ÷ receita.", net_margin: "Lucro líquido ÷ receita.",
  net_debt_ebitda: "Anos de geração de caixa para pagar a dívida líquida. Acima de 3 preocupa.", coverage: "Lucro operacional ÷ juros. Abaixo de 2 é apertado.", current_ratio: "O que entra em 12 meses ÷ o que vence em 12 meses.",
  graham_gap: "Quanto o preço está abaixo do número de Graham.", ey_gap: "Rendimento do lucro (1 ÷ P/L) menos o juro da renda fixa.", drawdown: "Quanto o preço caiu desde o ponto mais alto em 52 semanas.",
  vs_ma200: "Preço contra a média dos últimos 200 dias. Acima = tendência de alta.", value_score: "Quão barata contra o setor, de 0 a 100.", quality_score: "Quão boa é a empresa contra o setor, de 0 a 100.",
  final_score: "60% valor + 40% qualidade, menos descontos por alerta.", sig: "Quantos dos dez sinais estão a favor.", ni_cagr5: "Crescimento médio anual do lucro em 5 anos.", rev_cagr5: "Crescimento médio anual da receita em 5 anos.",
  div_share: "Em quantos anos do histórico a empresa pagou dividendo.", range52: "Onde o preço está entre a mínima e a máxima de 52 semanas.", mcap: "Preço × número de ações.", liquidity: "Volume médio negociado por dia.",
};
const SERIES_COLORS = ["var(--s1)", "var(--s2)", "var(--s3)"];
async function getPrices(tk) {
  if (S.prices[tk] === undefined) S.prices[tk] = await fetch(`${BASE}data/prices/${encodeURIComponent(tk)}.json`, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return S.prices[tk];
}
function downloadCsv(name, rows) {
  const csv = rows.map((r) => r.map((c) => { const v = c === null || c === undefined ? "" : typeof c === "number" ? String(c).replace(".", ",") : String(c); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(";")).join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
