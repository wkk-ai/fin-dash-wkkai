/* Chart builders. Each returns an SVG string sized to the width it is given. Colour = verdict only. */
"use strict";

function niceTicks(lo, hi, n = 5) {
  const span = hi - lo || 1, step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n + 1) || step0;
  const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(+v.toFixed(10));
  return out;
}
function domainOf(list, key) {
  const m = METRICS[key]; if (m.dom) return m.dom;
  const vals = list.map((s) => mget(key, s)).filter((v) => v !== null).sort((a, b) => a - b);
  if (!vals.length) return [0, 1];
  let lo = quantile(vals, 0.02), hi = quantile(vals, 0.98);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.04; return [lo - pad, hi + pad];
}

/** Bubble chart. opts: x, y (metric keys), h, quad {x, y, labels:[tl,tr,bl,br]}, vline/hline {v, label}, labels (n tickers to name), hl (ticker), dim (fade non-opportunities) */
function scatter(list, w, opts) {
  const h = opts.h || Math.round(Math.min(560, Math.max(320, w * 0.62)));
  const pl = 46, pr = 16, pt = 30, pb = 44;
  const dx = domainOf(list, opts.x), dy = domainOf(list, opts.y);
  const X = (v) => pl + ((Math.min(dx[1], Math.max(dx[0], v)) - dx[0]) / (dx[1] - dx[0])) * (w - pl - pr);
  const Y = (v) => h - pb - ((Math.min(dy[1], Math.max(dy[0], v)) - dy[0]) / (dy[1] - dy[0])) * (h - pt - pb);
  const mx = METRICS[opts.x], my = METRICS[opts.y];
  const caps = list.map((s) => s.market_cap).filter(isNum), cmax = Math.max(...caps, 1);
  const R = (s) => 3.5 + Math.sqrt((isNum(s.market_cap) ? s.market_cap : 0) / cmax) * (w < 520 ? 10 : 16);
  const pts = list.map((s) => ({ s, vx: mget(opts.x, s), vy: mget(opts.y, s) })).filter((p) => p.vx !== null && p.vy !== null);
  // big bubbles first so small ones stay reachable; opportunities drawn last (on top)
  pts.sort((a, b) => (a.s.verdict === "oportunidade") - (b.s.verdict === "oportunidade") || (b.s.market_cap || 0) - (a.s.market_cap || 0));
  let g = "", qlab = "";
  if (opts.quad) {
    const qx = X(opts.quad.x), qy = Y(opts.quad.y), L = opts.quad.labels;
    g += `<rect x="${qx}" y="${pt}" width="${w - pr - qx}" height="${qy - pt}" fill="var(--good-wash)"/>`;
    g += `<line x1="${qx}" x2="${qx}" y1="${pt}" y2="${h - pb}" stroke="var(--axis)"/><line x1="${pl}" x2="${w - pr}" y1="${qy}" y2="${qy}" stroke="var(--axis)"/>`;
    qlab += `<text class="ql" x="${pl + 8}" y="${pt + 18}">${L[0]}</text><text class="ql" x="${w - pr - 8}" y="${pt + 18}" text-anchor="end">${L[1]}</text>`;
    qlab += `<text class="ql" x="${pl + 8}" y="${h - pb - 10}">${L[2]}</text><text class="ql" x="${w - pr - 8}" y="${h - pb - 10}" text-anchor="end">${L[3]}</text>`;
  }
  for (const t of niceTicks(dx[0], dx[1], w < 520 ? 4 : 6)) g += `<line x1="${X(t)}" x2="${X(t)}" y1="${h - pb}" y2="${h - pb + 4}" stroke="var(--axis)"/><text x="${X(t)}" y="${h - pb + 17}" text-anchor="middle">${mx.f(t)}</text>`;
  for (const t of niceTicks(dy[0], dy[1], 5)) g += `${opts.quad ? "" : `<line x1="${pl}" x2="${w - pr}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--line)"/>`}<text x="${pl - 8}" y="${Y(t) + 4}" text-anchor="end">${my.f(t)}</text>`;
  g += `<line x1="${pl}" x2="${w - pr}" y1="${h - pb}" y2="${h - pb}" stroke="var(--axis)"/><line x1="${pl}" x2="${pl}" y1="${pt}" y2="${h - pb}" stroke="var(--axis)"/>`;
  g += `<text class="ax" x="${w - pr}" y="${h - 6}" text-anchor="end">${esc(mx.short || mx.l)}${mx.hint ? ", " + mx.hint + " →" : " →"}</text>`;
  g += `<text class="ax" x="0" y="12">↑ ${esc(my.short || my.l)}${my.hint ? ", " + my.hint : ""}</text>`;
  for (const l of [opts.vline && { ...opts.vline, v: 1 }, opts.hline && { ...opts.hline, v: 0 }].filter(Boolean)) {
    if (l.v) { const px = X(l.at); g += `<line x1="${px}" x2="${px}" y1="${pt}" y2="${h - pb}" stroke="var(--ink2)" stroke-width="1"/><text class="ql" x="${px + 6}" y="${pt + 12}">${esc(l.label)}</text>`; }
    else { const py = Y(l.at); g += `<line x1="${pl}" x2="${w - pr}" y1="${py}" y2="${py}" stroke="var(--ink2)" stroke-width="1"/><text class="ql" x="${w - pr - 4}" y="${py - 6}" text-anchor="end">${esc(l.label)}</text>`; }
  }
  for (const p of pts) {
    const s = p.s, op = s.verdict === "oportunidade", hl = opts.hl === s.ticker;
    const fo = hl ? 1 : opts.hl ? 0.28 : op ? 0.9 : s.verdict === "neutra" || s.verdict === "evitar" ? 0.38 : 0.5;
    const hollow = s.verdict === "evitar";
    g += `<circle class="pt${hl ? " hl" : ""}" data-st="${esc(s.ticker)}" data-t="${esc(s.ticker)}" cx="${X(p.vx).toFixed(1)}" cy="${Y(p.vy).toFixed(1)}" r="${(hl ? Math.max(7, R(s)) : R(s)).toFixed(1)}" fill="${vcolor(s.verdict)}" fill-opacity="${hollow && !hl ? 0.12 : fo}"${hollow ? ` style="stroke:${vcolor("evitar")};stroke-width:1.5"` : ""}/>`;
  }
  g += qlab;
  // direct labels: the best few only, skipping collisions
  const want = opts.hl ? pts.filter((p) => p.s.ticker === opts.hl) : pts.filter((p) => p.s.verdict === "oportunidade").sort((a, b) => byScore(a.s, b.s)).slice(0, opts.labels || 0);
  const placed = [];
  for (const p of want) {
    const lx = X(p.vx), ly = Y(p.vy) - R(p.s) - 5, tw = p.s.ticker.length * 7.2;
    const left = Math.max(pl + 2, Math.min(w - pr - tw - 2, lx - tw / 2)), box = [left, ly - 11, left + tw, ly + 2];
    if (ly < pt + 26 || placed.some((b) => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) continue;
    placed.push(box); g += `<text class="lbl" x="${left}" y="${ly}">${esc(p.s.ticker)}</text>`;
  }
  return `<svg class="chart" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Gráfico de bolhas: ${esc(mx.l)} por ${esc(my.l)}">${g}</svg>`;
}

/** Squarified treemap: sectors sized by total market cap, each stock a cell coloured by verdict. */
function squarify(items, x0, y0, w, h) {
  const out = [], total = items.reduce((a, i) => a + i.v, 0); if (!total || w <= 0 || h <= 0) return out;
  let rest = items.slice().sort((a, b) => b.v - a.v), x = x0, y = y0, ww = w, hh = h, scale = (w * h) / total;
  const worst = (row, side) => { const s = row.reduce((a, i) => a + i.v * scale, 0), mx = Math.max(...row.map((i) => i.v * scale)), mn = Math.min(...row.map((i) => i.v * scale)); return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn)); };
  while (rest.length) {
    const side = Math.min(ww, hh); let row = [rest[0]], i = 1;
    while (i < rest.length && worst(row.concat(rest[i]), side) <= worst(row, side)) row.push(rest[i++]);
    const area = row.reduce((a, r) => a + r.v * scale, 0), thick = area / side; let off = 0;
    for (const r of row) { const len = (r.v * scale) / thick; out.push(ww >= hh ? { ...r, x: x, y: y + off, w: thick, h: len } : { ...r, x: x + off, y: y, w: len, h: thick }); off += len; }
    if (ww >= hh) { x += thick; ww -= thick; } else { y += thick; hh -= thick; }
    rest = rest.slice(row.length);
  }
  return out;
}
function treemap(list, w) {
  const h = Math.round(Math.min(620, Math.max(380, w * 0.6)));
  const groups = {}; for (const s of list) if (isNum(s.market_cap) && s.market_cap > 0) (groups[(S.market === "ALL" ? s.market + " " : "") + s.sector] ||= []).push(s);
  const secs = squarify(Object.entries(groups).map(([k, arr]) => ({ k, arr, v: arr.reduce((a, s) => a + s.market_cap, 0) })), 0, 0, w, h);
  let g = "";
  for (const sec of secs) {
    const head = sec.h > 44 && sec.w > 70 ? 16 : 0;
    for (const c of squarify(sec.arr.map((s) => ({ s, v: s.market_cap })), sec.x + 1, sec.y + head + 1, sec.w - 2, sec.h - head - 2)) {
      const v = c.s.verdict;
      g += `<rect class="cell" data-st="${esc(c.s.ticker)}" data-t="${esc(c.s.ticker)}" x="${c.x.toFixed(1)}" y="${c.y.toFixed(1)}" width="${Math.max(0, c.w).toFixed(1)}" height="${Math.max(0, c.h).toFixed(1)}" fill="${vcolor(v)}" fill-opacity="${v === "oportunidade" ? 0.95 : v === "neutra" || v === "evitar" ? 0.45 : 0.7}"/>`;
      if (c.w > 46 && c.h > 20) g += `<text x="${c.x + 5}" y="${c.y + 14}" style="fill:${v === "neutra" ? "var(--ink)" : "#fff"};font-weight:600;pointer-events:none">${esc(c.s.ticker)}</text>`;
    }
    if (head) g += `<text x="${sec.x + 3}" y="${sec.y + 12}" style="fill:var(--ink2);font-size:11.5px">${esc(sec.k.length * 6.4 > sec.w ? sec.k.slice(0, Math.max(3, Math.floor(sec.w / 6.4) - 1)) + "…" : sec.k)}</text>`;
  }
  return `<svg class="chart" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Mapa do mercado por setor">${g}</svg>`;
}

/** Histogram of a metric with an optional reference line (e.g. the risk-free rate). Bars at or above the line are highlighted. */
function histogram(list, w, key, o) {
  const h = 230, pl = 8, pr = 8, pt = 24, pb = 30, m = METRICS[key];
  const vals = list.map((s) => mget(key, s)).filter((v) => v !== null && v >= o.lo && v <= o.hi);
  const n = Math.round((o.hi - o.lo) / o.step), bins = Array(n).fill(0);
  for (const v of vals) bins[Math.min(n - 1, Math.floor((v - o.lo) / o.step))]++;
  const mx = Math.max(...bins, 1), bw = (w - pl - pr) / n, X = (v) => pl + ((v - o.lo) / (o.hi - o.lo)) * (w - pl - pr);
  let g = "";
  bins.forEach((c, i) => {
    const a = o.lo + i * o.step, bh = (c / mx) * (h - pt - pb), good = isNum(o.ref) && a + o.step / 2 >= o.ref;
    g += `<g class="hz" data-tip="<b>${m.f(a)} a ${m.f(a + o.step)}</b><br>${c} ${c === 1 ? "ação" : "ações"}"><rect x="${pl + i * bw}" y="${pt}" width="${bw}" height="${h - pt - pb}" fill="transparent"/><rect class="b" x="${pl + i * bw + 1}" y="${h - pb - bh}" width="${Math.max(1, bw - 2)}" height="${bh}" rx="2" fill="${good ? "var(--v-oportunidade)" : "var(--v-neutra)"}"/></g>`;
  });
  g += `<line x1="${pl}" x2="${w - pr}" y1="${h - pb}" y2="${h - pb}" stroke="var(--axis)"/>`;
  for (const t of niceTicks(o.lo, o.hi, w < 520 ? 4 : 7)) g += `<text x="${X(t)}" y="${h - pb + 16}" text-anchor="middle">${m.f(t)}</text>`;
  if (isNum(o.ref) && o.ref > o.lo && o.ref < o.hi) { const rx = X(o.ref), right = rx < w * 0.7; g += `<line x1="${rx}" x2="${rx}" y1="${pt - 8}" y2="${h - pb}" stroke="var(--ink)" stroke-width="1.5"/><text class="ql" x="${rx + (right ? 6 : -6)}" y="${pt - 12}" text-anchor="${right ? "start" : "end"}" style="fill:var(--ink)">${esc(o.refLabel)}</text>`; }
  if (isNum(o.mark)) { const mx2 = X(Math.max(o.lo, Math.min(o.hi, o.mark))); g += `<line x1="${mx2}" x2="${mx2}" y1="${pt}" y2="${h - pb}" stroke="var(--ink)" stroke-width="2" stroke-dasharray="3 3"/><circle cx="${mx2}" cy="${pt}" r="5" fill="var(--ink)"/><text class="ql" x="${mx2 + (mx2 < w * 0.7 ? 9 : -9)}" y="${pt + 4}" text-anchor="${mx2 < w * 0.7 ? "start" : "end"}" style="fill:var(--ink)">${esc(o.markLabel || "")}</text>`; }
  return `<svg class="chart" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Distribuição de ${esc(m.l)}">${g}</svg>`;
}

/** One row per sector, one dot per stock along the score axis; the tick is the sector median. */
function strips(rows, w) {
  const rh = 30, lab = w < 560 ? 118 : 210, pr = 64, pt = 26, h = pt + rows.length * rh + 6;
  const X = (v) => lab + (Math.max(0, Math.min(100, v)) / 100) * (w - lab - pr);
  let g = "";
  for (const t of [0, 25, 50, 75, 100]) g += `<line x1="${X(t)}" x2="${X(t)}" y1="${pt - 6}" y2="${h}" stroke="var(--line)"/><text x="${X(t)}" y="${pt - 12}" text-anchor="middle">${t}</text>`;
  rows.forEach((r, i) => {
    const y = pt + i * rh + rh / 2, name = r.sector.length * 6.6 > lab - 10 ? r.sector.slice(0, Math.floor((lab - 10) / 6.6) - 1) + "…" : r.sector;
    g += `<g class="hz" data-sector="${esc(r.sector)}" data-smkt="${r.mkt}"><rect x="0" y="${y - rh / 2}" width="${lab - 6}" height="${rh}" fill="transparent"/><text x="0" y="${y + 4}" style="fill:var(--ink);font-size:13px">${esc(name)}</text></g>`;
    g += `<line x1="${X(0)}" x2="${X(100)}" y1="${y}" y2="${y}" stroke="var(--line)"/>`;
    r.arr.slice().sort((a, b) => (a.verdict === "oportunidade") - (b.verdict === "oportunidade")).forEach((s) => {
      let hsh = 0; for (const ch of s.ticker) hsh = (hsh * 31 + ch.charCodeAt(0)) % 997;
      const op = s.verdict === "oportunidade";
      g += `<circle class="pt" data-st="${esc(s.ticker)}" data-t="${esc(s.ticker)}" cx="${X(s.final_score || 0).toFixed(1)}" cy="${(y + ((hsh % 11) - 5) * 1.5).toFixed(1)}" r="${op ? 5 : 4}" fill="${vcolor(s.verdict)}" fill-opacity="${op ? 0.95 : 0.5}"/>`;
    });
    if (isNum(r.med)) g += `<line x1="${X(r.med)}" x2="${X(r.med)}" y1="${y - 10}" y2="${y + 10}" stroke="var(--ink)" stroke-width="2"/>`;
    g += `<text x="${w - 2}" y="${y + 4}" text-anchor="end" style="fill:${r.ops ? "var(--ink)" : "var(--muted)"};font-weight:${r.ops ? 600 : 400}">${r.ops} de ${r.arr.length}</text>`;
  });
  return `<svg class="chart" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Score das ações por setor">${g}</svg>`;
}

/** Five-axis profile against the sector (50 = sector median). */
function radar(dims, w) {
  const size = Math.min(w, 340), c = size / 2, R = c - 70, n = DIMS.length;
  const P = (i, v) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n, r = (Math.max(0, Math.min(100, v)) / 100) * R; return [c + r * Math.cos(a), c + r * Math.sin(a)]; };
  const ring = (v, st) => `<polygon points="${DIMS.map((_, i) => P(i, v).map((q) => q.toFixed(1)).join(",")).join(" ")}" fill="none" ${st}/>`;
  let g = ring(100, 'stroke="var(--line)"') + ring(50, 'stroke="var(--axis)"') + ring(25, 'stroke="var(--line)"') + ring(75, 'stroke="var(--line)"');
  DIMS.forEach(([k, l], i) => {
    const [ax, ay] = P(i, 100), [tx, ty] = P(i, 118), v = dims ? dims[k] : null, an = tx > c + 10 ? "start" : tx < c - 10 ? "end" : "middle";
    g += `<line x1="${c}" y1="${c}" x2="${ax}" y2="${ay}" stroke="var(--line)"/>`;
    g += `<text x="${tx}" y="${ty - 2 - (i === 0 ? 12 : 0)}" text-anchor="${an}" style="fill:var(--ink2);font-size:12px">${l}</text><text x="${tx}" y="${ty + 13 - (i === 0 ? 12 : 0)}" text-anchor="${an}" style="fill:var(--ink);font-weight:600;font-size:13px">${isNum(v) ? v : "–"}</text>`;
  });
  const pts = DIMS.map(([k], i) => P(i, dims && isNum(dims[k]) ? dims[k] : 0));
  g += `<polygon points="${pts.map((q) => q.map((z) => z.toFixed(1)).join(",")).join(" ")}" fill="var(--ink)" fill-opacity=".1" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round"/>`;
  DIMS.forEach(([k], i) => { if (dims && isNum(dims[k])) g += `<circle cx="${pts[i][0]}" cy="${pts[i][1]}" r="3.5" fill="var(--ink)" stroke="var(--page)" stroke-width="2"/>`; });
  return `<svg class="chart" style="max-width:${size}px;margin:0 auto" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Perfil da ação contra o setor">${g}</svg>`;
}

function spark(vals, w = 64, h = 22) {
  const v = (vals || []).filter(isNum); if (v.length < 2) return `<svg width="${w}" height="${h}"></svg>`;
  const lo = Math.min(...v), hi = Math.max(...v), sp = hi - lo || 1;
  const d = v.map((p, i) => `${i ? "L" : "M"}${((i / (v.length - 1)) * (w - 2) + 1).toFixed(1)},${(h - 2 - ((p - lo) / sp) * (h - 4)).toFixed(1)}`).join("");
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="${v[v.length - 1] >= v[0] ? "var(--up)" : "var(--down)"}" stroke-width="1.5"/></svg>`;
}

/** Price against its reference points on one line. marks: [{v, label, strong}] */
function ruler(marks, w, cur) {
  const ms = marks.filter((m) => isNum(m.v) && m.v > 0).sort((a, b) => a.v - b.v); if (ms.length < 2) return "";
  if (w < 560) return `<div>${ms.map((m) => `<div class="trk" style="grid-template-columns:1fr auto"><span${m.strong ? ' style="font-weight:600"' : ""}>${esc(m.label)}</span><span class="v">${money(m.v, cur)}</span></div>`).join("")}</div>`;
  const h = 96, pl = 40, pr = 40, lo = ms[0].v, hi = ms[ms.length - 1].v, X = (v) => pl + ((v - lo) / (hi - lo || 1)) * (w - pl - pr), y = 48;
  let g = `<line x1="${pl}" x2="${w - pr}" y1="${y}" y2="${y}" stroke="var(--axis)" stroke-width="2"/>`, lastUp = -1e9, lastDn = -1e9;
  ms.forEach((m) => {
    const px = X(m.v), tw = Math.max(m.label.length, money(m.v, cur).length) * 6.4;
    let up = px - tw / 2 > lastUp + 6; if (!up && !(px - tw / 2 > lastDn + 6)) up = lastUp <= lastDn;
    if (up) lastUp = px + tw / 2; else lastDn = px + tw / 2;
    const ty = up ? y - 26 : y + 24, anchor = px < pl + 30 ? "start" : px > w - pr - 30 ? "end" : "middle";
    g += m.strong ? `<circle cx="${px}" cy="${y}" r="7" fill="var(--ink)" stroke="var(--page)" stroke-width="2"/>` : `<line x1="${px}" x2="${px}" y1="${y - 7}" y2="${y + 7}" stroke="var(--ink2)" stroke-width="2"/>`;
    g += `<text x="${px}" y="${ty}" text-anchor="${anchor}" style="fill:${m.strong ? "var(--ink)" : "var(--ink2)"};font-weight:${m.strong ? 600 : 400};font-size:12px">${esc(m.label)}</text><text x="${px}" y="${ty + 14}" text-anchor="${anchor}" style="font-variant-numeric:tabular-nums">${money(m.v, cur)}</text>`;
  });
  return `<svg class="chart" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Preço contra referências">${g}</svg>`;
}

/** Small bar chart of one yearly series. rows: [[year, value]] */
function miniBars(rows, w, fmt) {
  const pts = rows.filter((r) => isNum(r[1])); if (pts.length < 2) return `<p class="note">Sem histórico.</p>`;
  const h = 110, pb = 16, pt = 4, n = pts.length, bw = w / n, vals = pts.map((r) => r[1]);
  const mx = Math.max(...vals, 0), mn = Math.min(...vals, 0), sp = mx - mn || 1, y0 = pt + (mx / sp) * (h - pt - pb);
  let g = `<line x1="0" x2="${w}" y1="${y0}" y2="${y0}" stroke="var(--axis)"/>`;
  pts.forEach((r, i) => {
    const v = r[1], bh = Math.max(1.5, (Math.abs(v) / sp) * (h - pt - pb));
    g += `<g class="hz" data-tip="<b>${r[0]}</b><br>${fmt(v)}"><rect x="${i * bw}" y="0" width="${bw}" height="${h}" fill="transparent"/><rect class="b" x="${i * bw + 2}" y="${v >= 0 ? y0 - bh : y0}" width="${Math.max(2, bw - 4)}" height="${bh}" rx="2" fill="${v >= 0 ? "var(--ink)" : "var(--v-barata_risco)"}" fill-opacity="${i === n - 1 ? 1 : 0.55}"/></g>`;
  });
  g += `<text x="2" y="${h - 2}">${pts[0][0]}</text><text x="${w - 2}" y="${h - 2}" text-anchor="end">${pts[n - 1][0]}</text>`;
  return `<svg class="chart" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${g}</svg>`;
}

// ---------- price chart (line + 200-day average, with crosshair) ----------
const PRICE_RANGES = [["1M", 21, "d"], ["6M", 126, "d"], ["1A", 252, "d"], ["3A", 156, "w"], ["5A", 260, "w"], ["10A", 520, "w"]];
async function priceCard(s) {
  const box = document.getElementById("pricebox"); if (!box) return;
  const data = await getPrices(s.ticker); if (!document.body.contains(box)) return;
  if (!data || (!(data.d || []).length && !(data.w || []).length)) { box.innerHTML = `<p class="note">Histórico de preço ainda não coletado para esta ação.</p>`; return; }
  const draw = (key) => {
    const [label, nPts, kind] = PRICE_RANGES.find((r) => r[0] === key) || PRICE_RANGES[2];
    const full = data[kind] || [], pts = full.slice(-nPts), win = kind === "d" ? 200 : 40;
    const ma = pts.map((_, i) => { const j = full.length - pts.length + i; if (j + 1 < win) return null; let t = 0; for (let k = j - win + 1; k <= j; k++) t += full[k][1]; return t / win; });
    const w = Math.max(280, box.clientWidth);
    box.innerHTML = `<div class="prange">${PRICE_RANGES.map(([l]) => `<button data-pr="${l}" class="${l === label ? "on" : ""}">${l}</button>`).join("")}</div>` + priceSvg(pts, ma, w, win, kind);
    box.querySelectorAll("[data-pr]").forEach((b) => b.addEventListener("click", () => { store.set("prange", b.dataset.pr); draw(b.dataset.pr); }));
    bindPriceHover(box, pts, ma, s.currency);
  };
  draw(store.get("prange", "1A")); mounts.push(() => draw(store.get("prange", "1A")));
}
function priceSvg(pts, ma, w, win, kind) {
  if (pts.length < 2) return `<p class="note">Poucos dados para este período.</p>`;
  const h = Math.round(Math.min(320, Math.max(220, w * 0.34))), pl = 0, pr = 54, pt = 10, pb = 22;
  const vals = pts.map((p) => p[1]).concat(ma.filter(isNum)); let lo = Math.min(...vals), hi = Math.max(...vals);
  const padv = (hi - lo) * 0.06 || hi * 0.05 || 1; lo -= padv; hi += padv;
  const X = (i) => pl + (i / (pts.length - 1)) * (w - pl - pr), Y = (v) => pt + ((hi - v) / (hi - lo)) * (h - pt - pb);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p[1]).toFixed(1)}`).join("");
  let maPath = ""; ma.forEach((v, i) => { if (isNum(v)) maPath += `${maPath ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; });
  const first = pts[0][1], last = pts[pts.length - 1][1], chg = last / first - 1, lastMa = [...ma].reverse().find(isNum), unit = kind === "d" ? "dias" : "semanas";
  const yl = niceTicks(lo, hi, 4).map((v) => `<line x1="${pl}" x2="${w - pr}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${w - pr + 8}" y="${Y(v) + 4}">${NF[2].format(v)}</text>`).join("");
  const dl = [0, Math.floor((pts.length - 1) / 2), pts.length - 1].map((i) => `<text x="${X(i)}" y="${h - 5}" text-anchor="${i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle"}">${fmtDate(pts[i][0])}</text>`).join("");
  const trend = isNum(lastMa) ? `. Preço ${last >= lastMa ? "acima" : "abaixo"} da média de ${win} ${unit}: tendência de ${last >= lastMa ? "alta" : "baixa"} (linha cinza)` : "";
  return `<div class="pchg"><b class="${chg >= 0 ? "up" : "down"}">${spct(chg, 1)}</b> no período${trend}.</div>
    <svg class="chart pchart" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Histórico de preço">${yl}
      <path d="${line}" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round"/>
      ${maPath ? `<path d="${maPath}" fill="none" stroke="var(--muted)" stroke-width="1.5"/>` : ""}
      ${dl}<line class="cross" x1="0" x2="0" y1="${pt}" y2="${h - pb}" stroke="var(--axis)" style="display:none"/>
      <circle class="dot" r="4.5" fill="var(--ink)" stroke="var(--page)" stroke-width="2" style="display:none"/>
      <rect class="hover" x="${pl}" y="0" width="${w - pl - pr}" height="${h}" fill="transparent" data-geom="${[w, h, pl, pr, pt, pb, lo, hi].join(",")}"/></svg>
    <p class="note">Preço ajustado por dividendos e desdobramentos. Fonte: Yahoo Finance.</p>`;
}
function bindPriceHover(box, pts, ma, cur) {
  const svg = box.querySelector("svg.pchart"); if (!svg) return;
  const r = svg.querySelector("rect.hover"), cross = svg.querySelector(".cross"), dot = svg.querySelector(".dot");
  const [w, h, pl, pr, pt, pb, lo, hi] = r.dataset.geom.split(",").map(Number);
  const X = (i) => pl + (i / (pts.length - 1)) * (w - pl - pr), Y = (v) => pt + ((hi - v) / (hi - lo)) * (h - pt - pb);
  const move = (ev) => {
    const bb = svg.getBoundingClientRect(), cx = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - bb.left) * (w / bb.width);
    const i = Math.max(0, Math.min(pts.length - 1, Math.round(((cx - pl) / (w - pl - pr)) * (pts.length - 1)))), [d, v] = pts[i], ch = v / pts[0][1] - 1;
    cross.setAttribute("x1", X(i)); cross.setAttribute("x2", X(i)); cross.style.display = ""; dot.setAttribute("cx", X(i)); dot.setAttribute("cy", Y(v)); dot.style.display = "";
    showTip(`<b>${fmtDate(d, true)}</b><br>${money(v, cur)}<br><span class="${ch >= 0 ? "up" : "down"}">${spct(ch, 1)}</span> desde o início do período` + (isNum(ma[i]) ? `<br><span class="m">Média móvel: ${money(ma[i], cur)}</span>` : ""), ev);
  };
  const leave = () => { cross.style.display = "none"; dot.style.display = "none"; hideTip(); };
  r.addEventListener("mousemove", move); r.addEventListener("touchmove", move, { passive: true }); r.addEventListener("mouseleave", leave); r.addEventListener("touchend", leave);
}

// ---------- more chart types ----------
/** Several series on one indexed axis. series: [{name, color, pts:[[label, value]]}] all the same length. */
function lineChart(series, w, o = {}) {
  const ss = series.filter((s) => s.pts.length > 1); if (!ss.length) return `<p class="note">Sem dados para este gráfico.</p>`;
  const h = o.h || Math.round(Math.min(320, Math.max(220, w * 0.36))), pl = 0, pr = 54, pt = 12, pb = 22, n = Math.max(...ss.map((s) => s.pts.length));
  const vals = ss.flatMap((s) => s.pts.map((p) => p[1])).filter(isNum); let lo = Math.min(...vals, isNum(o.ref) ? o.ref : Infinity), hi = Math.max(...vals, isNum(o.ref) ? o.ref : -Infinity);
  const pad = (hi - lo) * 0.06 || 1; lo -= pad; hi += pad;
  const X = (i) => pl + (i / (n - 1)) * (w - pl - pr), Y = (v) => pt + ((hi - v) / (hi - lo)) * (h - pt - pb), f = o.fmt || ((v) => x(v, 0));
  let g = niceTicks(lo, hi, 4).map((v) => `<line x1="${pl}" x2="${w - pr}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${w - pr + 8}" y="${Y(v) + 4}">${f(v)}</text>`).join("");
  if (isNum(o.ref)) g += `<line x1="${pl}" x2="${w - pr}" y1="${Y(o.ref)}" y2="${Y(o.ref)}" stroke="var(--axis)" stroke-dasharray="4 4"/>`;
  for (const s of ss) {
    let d = ""; s.pts.forEach((p, i) => { if (isNum(p[1])) d += `${d ? "L" : "M"}${X(i + n - s.pts.length).toFixed(1)},${Y(p[1]).toFixed(1)}`; });
    if (o.area && d) g += `<path d="${d}L${X(n - 1).toFixed(1)},${Y(isNum(o.ref) ? o.ref : lo)}L${X(n - s.pts.length).toFixed(1)},${Y(isNum(o.ref) ? o.ref : lo)}Z" fill="${s.color}" fill-opacity=".14"/>`;
    g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>`;
  }
  const ref = ss.reduce((a, b) => (b.pts.length > a.pts.length ? b : a)), lab = (i) => (o.xfmt ? o.xfmt(ref.pts[i][0]) : ref.pts[i][0]);
  g += [0, Math.floor((n - 1) / 2), n - 1].map((i) => `<text x="${X(i)}" y="${h - 5}" text-anchor="${i === 0 ? "start" : i === n - 1 ? "end" : "middle"}">${lab(i)}</text>`).join("");
  const step = Math.max(1, Math.ceil(n / 160)), cw = ((w - pl - pr) / (n - 1)) * step;
  for (let i = 0; i < n; i += step) {
    const tip = `<b>${o.xfull ? o.xfull(ref.pts[i][0]) : lab(i)}</b>` + ss.map((s) => { const p = s.pts[i - (n - s.pts.length)]; return p && isNum(p[1]) ? `<br>${ss.length > 1 || o.named ? esc(s.name) + ": " : ""}${f(p[1])}` : ""; }).join("");
    g += `<rect class="hzc" x="${X(i) - cw / 2}" y="${pt}" width="${cw}" height="${h - pt - pb}" fill="transparent" data-tip="${esc(tip)}"/>`;
  }
  return `<svg class="chart" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(o.label || "Gráfico de linhas")}">${g}</svg>`;
}
/** Radar with up to three overlaid profiles. list: [{name, color, dims}] */
function radarMulti(list, w) {
  const size = Math.min(w, 380), c = size / 2, R = c - 74, n = DIMS.length;
  const P = (i, v) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n, r = (Math.max(0, Math.min(100, v)) / 100) * R; return [c + r * Math.cos(a), c + r * Math.sin(a)]; };
  let g = [25, 50, 75, 100].map((v) => `<polygon points="${DIMS.map((_, i) => P(i, v).map((q) => q.toFixed(1)).join(",")).join(" ")}" fill="none" stroke="${v === 50 ? "var(--axis)" : "var(--line)"}"/>`).join("");
  DIMS.forEach(([k, l], i) => { const [ax, ay] = P(i, 100), [tx, ty] = P(i, 120); g += `<line x1="${c}" y1="${c}" x2="${ax}" y2="${ay}" stroke="var(--line)"/><text x="${tx}" y="${ty + 4}" text-anchor="${tx > c + 10 ? "start" : tx < c - 10 ? "end" : "middle"}" style="fill:var(--ink2);font-size:12px">${l}</text>`; });
  for (const it of list) g += `<polygon points="${DIMS.map(([k], i) => P(i, it.dims && isNum(it.dims[k]) ? it.dims[k] : 0).map((z) => z.toFixed(1)).join(",")).join(" ")}" fill="${it.color}" fill-opacity=".08" stroke="${it.color}" stroke-width="2" stroke-linejoin="round" data-tip="<b>${esc(it.name)}</b><br>${DIMS.map(([k, l]) => `${l}: ${it.dims && isNum(it.dims[k]) ? it.dims[k] : "–"}`).join("<br>")}"/>`;
  return `<svg class="chart" style="max-width:${size}px;margin:0 auto" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Perfis sobrepostos">${g}</svg>`;
}
/** Fair-value references against today's price. rows: [{label, v, hint}] */
function fairChart(rows, price, w, cur) {
  const rs = rows.filter((r) => isNum(r.v) && r.v > 0); if (!rs.length || !(price > 0)) return `<p class="note">Sem dados suficientes para estimar referências de valor.</p>`;
  const narrow = w < 560, lab = narrow ? 0 : 230, pr = 118, rh = narrow ? 60 : 40, pt = 30, h = pt + rs.length * rh + 8;
  const hi = Math.max(price, ...rs.map((r) => r.v)) * 1.08, X = (v) => lab + (Math.min(hi, v) / hi) * (w - lab - pr), px = X(price);
  let g = `<line x1="${px}" x2="${px}" y1="${pt - 8}" y2="${h}" stroke="var(--ink)" stroke-width="1.5"/><text class="ql" x="${px}" y="${pt - 14}" text-anchor="${px > w - pr - 60 ? "end" : "middle"}" style="fill:var(--ink)">Preço hoje ${money(price, cur)}</text>`;
  rs.forEach((r, i) => {
    const y = pt + i * rh + rh / 2 + (narrow ? 8 : 0), up = r.v / price - 1, good = up >= 0, vx = X(r.v);
    g += `<g data-tip="<b>${esc(r.label)}</b><br>${esc(r.hint)}<br>${money(r.v, cur)} (${spct(up)} contra o preço)"><rect x="0" y="${y - rh / 2}" width="${w}" height="${rh}" fill="transparent"/>`;
    g += `<text x="0" y="${narrow ? y - 16 : y + 4}" style="fill:var(--ink);font-size:13px;paint-order:stroke;stroke:var(--page);stroke-width:4px">${esc(r.label)}</text><line x1="${lab}" x2="${w - pr}" y1="${y}" y2="${y}" stroke="var(--line)"/>`;
    g += `<rect x="${Math.min(px, vx)}" y="${y - 4}" width="${Math.max(1, Math.abs(vx - px))}" height="8" rx="4" fill="${good ? "var(--v-oportunidade)" : "var(--v-barata_risco)"}" fill-opacity=".85"/><circle cx="${vx}" cy="${y}" r="6" fill="${good ? "var(--v-oportunidade)" : "var(--v-barata_risco)"}" stroke="var(--page)" stroke-width="2"/>`;
    g += `<text x="${w}" y="${y - 2}" text-anchor="end" style="fill:var(--ink);font-weight:600;font-size:13px">${money(r.v, cur)}</text><text x="${w}" y="${y + 13}" text-anchor="end">${spct(up)}</text></g>`;
  });
  return `<svg class="chart" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Referências de valor contra o preço">${g}</svg>`;
}
