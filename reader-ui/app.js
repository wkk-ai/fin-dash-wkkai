/* Fechamento do mês: reads the month's prints in the browser and hands the checked month to FinTrack.
   Text recognition: Tesseract (WebAssembly). Checking engine: reader/*.py run by Pyodide.
   The prints stay on this device (IndexedDB); only the final rows go to FinTrack, after you confirm. */
(function () {
"use strict";
if (window.ReaderApp) return;

const BASE = () => window.__READER_BASE || "/reader/";
let root = null, opts = null, W = null, pyo = null, uid = "anon", booting = null;
const alive = () => !!root && document.body.contains(root);
const $ = (s, el) => (el || root).querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const brl = v => (v < 0 ? "-" : "") + "R$ " + Math.abs(v).toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2});
const signed = v => (v > 0 ? "+" : v < 0 ? "−" : "") + "R$ " + Math.abs(v).toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2});
const plain = v => v.toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2});
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const PIX = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
/** Pieces of a print are drawn on demand from the copy kept in this browser (see hydrate()). */
const img = (name, box, w = 900, pad = 2.2) => `${PIX}" data-crop="${encodeURIComponent(JSON.stringify([name, box && box.length ? box : null, w, pad]))}`;
const CLASS_COLOR = {"Renda Fixa":"#137fec","Renda Variável":"#7A3FD0","Título Público":"#0B7A53","Previdência":"#D98A00"};
const TRUST = {proven:"Bate com o total que o banco mostra", checked:"Lido duas vezes, igual", user:"Informado por você", review:"Precisa conferir", manual:"Sem print: informe o valor"};
let S = {data:null, open:{}, openBank:{}, busy:null, showPrints:false, settingsSent:""};

/* ---------- prints kept on this device ---------- */
const store = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open("fintrack-reader", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("prints");
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const run = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => {
    const t = db.transaction("prints", mode), req = fn(t.objectStore("prints"));
    t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error); }); };
  const key = n => uid + "/" + n;
  return {
    put: (n, blob) => run("readwrite", s => s.put(blob, key(n))),
    get: n => run("readonly", s => s.get(key(n))),
    del: n => run("readwrite", s => s.delete(key(n))),
    clear: async () => { const ks = await run("readonly", s => s.getAllKeys()); await run("readwrite", s => { ks.filter(k => String(k).startsWith(uid + "/")).forEach(k => s.delete(k)); return null; }); },
  };
})();
const crops = new Map();
async function crop(spec) {
  if (crops.has(spec)) return crops.get(spec);
  const [name, box, maxW, pad] = JSON.parse(decodeURIComponent(spec));
  const p = (async () => {
    const blob = await store.get(name); if (!blob) return null;
    const bmp = await createImageBitmap(blob);
    let y0 = 0, y1 = bmp.height;
    if (box) { const ph = Math.max(box[3] - box[1], 20) * pad; y0 = Math.max(0, box[1] - ph); y1 = Math.min(bmp.height, box[3] + ph); if (y1 - y0 <= 4) { y0 = 0; y1 = bmp.height; } }
    const w = Math.min(maxW, bmp.width), h = Math.max(1, Math.round((y1 - y0) * w / bmp.width));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    c.getContext("2d").drawImage(bmp, 0, y0, bmp.width, y1 - y0, 0, 0, w, h);
    return c.toDataURL("image/jpeg", 0.82);
  })();
  crops.set(spec, p); return p;
}
function hydrate(el) {
  (el || root).querySelectorAll("img[data-crop]").forEach(i => { crop(i.dataset.crop).then(u => { if (u) i.src = u; else i.closest(".pr, .proof-img") && i.classList.add("missing"); }); });
}

/* ---------- the engine (Python in the browser) ---------- */
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Não consegui carregar " + src)); document.head.appendChild(s); }); }
let syncing = Promise.resolve();
function persist() { if (pyo) syncing = syncing.then(() => new Promise(r => pyo.FS.syncfs(false, () => r()))); }
async function boot() {
  if (!window.loadPyodide) await loadScript(BASE() + "pyodide/pyodide.js");
  pyo = await window.loadPyodide({ indexURL: BASE() + "pyodide/" });
  const files = await (await fetch(BASE() + "py/files.json", { cache: "no-cache" })).json();
  await Promise.all(files.map(async f => {
    const text = await (await fetch(BASE() + "py/" + f, { cache: "no-cache" })).text();
    const path = "/code/" + f; pyo.FS.mkdirTree(path.slice(0, path.lastIndexOf("/"))); pyo.FS.writeFile(path, text);
  }));
  const dir = "/fr-" + uid.replace(/[^\w-]/g, "");
  pyo.FS.mkdirTree(dir);
  try { pyo.FS.mount(pyo.FS.filesystems.IDBFS, {}, dir); await new Promise(r => pyo.FS.syncfs(true, () => r())); } catch (e) { console.warn("reader: no persistent storage", e); }
  pyo.runPython(`import sys\nsys.path.insert(0, "/code")\nimport webapp\nfrom pathlib import Path\nwebapp.ROOT = Path("${dir}")`);
  W = pyo.pyimport("webapp");
}
function call(fn, ...args) {
  const out = JSON.parse(W[fn](...args));
  if (!out.ok) throw new Error(out.error || "Erro");
  return out.data;
}
function afterChange(d) {
  persist();
  const s = JSON.stringify(d.settings || {});
  if (S.settingsSent && s !== S.settingsSent && opts.saveSettings) opts.saveSettings(d.settings).catch(() => toast("Não consegui salvar suas linhas sem print no FinTrack."));
  S.settingsSent = s;
}
async function act(a, okMsg) {
  try { S.data = call("act", JSON.stringify(a)); afterChange(S.data); if (okMsg) toast(okMsg); render(); }
  catch (e) { toast(e.message); }
}
async function refresh() { S.data = call("state"); render(); }

/* ---------- reading the text of a print ---------- */
let tessP = null, digitsP = null;
const TESS_OPTS = () => ({ workerPath: BASE() + "tess/worker.min.js", corePath: BASE() + "tess/core", langPath: BASE() + "tess/lang", gzip: true, workerBlobURL: false });
/** Second reader: re-reads every amount alone, as a single line, like the second engine of the Mac app. */
function digitsReader() {
  return digitsP || (digitsP = (async () => {
    await tesseract();
    const w = await window.Tesseract.createWorker("por", 1, TESS_OPTS());
    await w.setParameters({ tessedit_pageseg_mode: "7" });   // one line; measured best on 206 amounts
    return w;
  })());
}
function tesseract() {
  return tessP || (tessP = (async () => {
    if (!window.Tesseract) await loadScript(BASE() + "tess/tesseract.min.js");
    const w = await window.Tesseract.createWorker("por", 1, TESS_OPTS());
    await w.setParameters({ tessedit_pageseg_mode: "11", preserve_interword_spaces: "1" });
    return w;
  })());
}
async function sha1(blob) {
  const h = await crypto.subtle.digest("SHA-1", await blob.arrayBuffer());
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("");
}
/** One print -> the reading the engine expects: pieces of text with their position, like Apple's reader gives. */
async function readPrint(blob, name) {
  let bmp;
  try { bmp = await createImageBitmap(blob); } catch (e) { return { name, width: 0, height: 0, tokens: [], alt_tokens: [], error: "Não consegui abrir a imagem (use PNG ou JPG)." }; }
  const scale = bmp.width < 1000 ? 2 : 1, cw = bmp.width * scale, ch = bmp.height * scale;
  const c = document.createElement("canvas"); c.width = cw; c.height = ch;
  const ctx = c.getContext("2d", { willReadFrequently: true }); ctx.drawImage(bmp, 0, 0, cw, ch);
  // Grey, and dark screens turned light: the text reader is trained on dark text over a light page.
  const im = ctx.getImageData(0, 0, cw, ch), px = im.data; let sum = 0;
  for (let i = 0; i < px.length; i += 4) { const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]; px[i] = px[i + 1] = px[i + 2] = g; sum += g; }
  if (sum / (px.length / 4) < 110) for (let i = 0; i < px.length; i += 4) px[i] = px[i + 1] = px[i + 2] = 255 - px[i];
  ctx.putImageData(im, 0, 0);
  const worker = await tesseract();
  const { data } = await worker.recognize(c, {}, { blocks: true });
  const words = [];
  for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) for (const w of l.words || []) {
    const t = (w.text || "").trim();
    if (t && w.bbox) words.push({ t, x0: w.bbox.x0 / scale, y0: w.bbox.y0 / scale, x1: w.bbox.x1 / scale, y1: w.bbox.y1 / scale, c: (w.confidence || 0) / 100 });
  }
  const tokens = joinWords(words).map(tidy);
  const alt_tokens = await rereadAmounts(c, scale, tokens);
  return { name, width: bmp.width, height: bmp.height, sha1: await sha1(blob), tokens, alt_tokens, error: "" };
}
const MONEY = /(?:R\$|\d[\d.]*,\d{2}\b)/;
/** Typical misreads on app screens: the "•" between a ticker and its name read as *, +, e or o. */
function tidy(t) {
  t.text = t.text.replace(/^([A-Z][A-Z0-9]{3}\d{1,2})\s+[*+eo°«»·]\s+/, "$1 • ");
  return t;
}
/** Re-read each piece that looks like money, alone and scaled to a steady size. */
async function rereadAmounts(canvas, scale, tokens) {
  const w = await digitsReader(), out = [];
  for (const t of tokens) {
    if (!MONEY.test(t.text) || (t.text.match(/\d/g) || []).length < 2) continue;
    const h = (t.y1 - t.y0) * scale, padY = h * 0.35, padX = h * 0.6;
    const x0 = Math.max(0, t.x0 * scale - padX), y0 = Math.max(0, t.y0 * scale - padY);
    const x1 = Math.min(canvas.width, t.x1 * scale + padX), y1 = Math.min(canvas.height, t.y1 * scale + padY);
    const k = Math.max(0.5, Math.min(4, 48 / Math.max(1, h)));
    const c = document.createElement("canvas"); c.width = Math.round((x1 - x0) * k); c.height = Math.round((y1 - y0) * k);
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingQuality = "high"; ctx.drawImage(canvas, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height);
    try {
      const { data } = await w.recognize(c);
      const text = (data.text || "").replace(/\s+/g, " ").trim();
      if (text) out.push({ text, x0: t.x0, y0: t.y0, x1: t.x1, y1: t.y1, conf: (data.confidence || 0) / 100 });
    } catch (e) { /* the first reading stays */ }
  }
  return out;
}
/** Words on the same text line and close together become one piece ("Saldo bruto", "R$ 1.234,56"). */
function joinWords(words) {
  words.sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
  const rows = [];
  for (const w of words) {
    const cy = (w.y0 + w.y1) / 2, h = w.y1 - w.y0;
    // Punctuation ("-", "•") has a tiny box: judge it by the height of the line it sits in.
    const r = rows.find(r => Math.abs(r.cy - cy) < Math.max(Math.min(r.h, h), r.h * 0.6) * 0.5);
    if (r) { r.ws.push(w); if (h >= r.h * 0.6) { r.n = (r.n || 1) + 1; r.cy = (r.cy * (r.n - 1) + cy) / r.n; } r.h = Math.max(r.h, h); } else rows.push({ cy, h, ws: [w], n: 1 });
  }
  const out = [];
  for (const r of rows) {
    r.ws.sort((a, b) => a.x0 - b.x0);
    const hs = r.ws.map(w => w.y1 - w.y0).sort((a, b) => a - b), mh = hs[hs.length - 1 - (hs.length >> 2)] || 10;
    let cur = null;
    for (const w of r.ws) {
      if (cur && w.x0 - cur.x1 <= mh * 1.1) { cur.text += " " + w.t; cur.x1 = Math.max(cur.x1, w.x1); cur.y0 = Math.min(cur.y0, w.y0); cur.y1 = Math.max(cur.y1, w.y1); cur.n++; cur.conf += w.c; }
      else { if (cur) out.push(cur); cur = { text: w.t, x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1, conf: w.c, n: 1 }; }
    }
    if (cur) out.push(cur);
  }
  return out.map(t => ({ text: t.text, x0: t.x0, y0: t.y0, x1: t.x1, y1: t.y1, conf: t.conf / t.n }));
}

/* ---------- reading the prints ---------- */
function toast(msg) {
  document.querySelectorAll(".reader-toast").forEach(t => t.remove());
  const t = document.createElement("div"); t.className = "reader-toast"; t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}
async function newMonthIfSaved() {
  const d = S.data;
  if (d && d.saved && confirm(`${cap(d.month_label)} já foi lançado.\n\nOK: começar um mês novo com estes prints.\nCancelar: juntar aos prints de ${d.month_label}.`)) {
    S.data = call("act", JSON.stringify({type:"clear"})); await store.clear(); crops.clear(); S.open = {}; S.openBank = {}; persist();
  }
}
async function readFiles(files) {
  files = [...files].filter(f => /^image\//.test(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name));
  if (!files.length) return toast("Nenhuma imagem nesses arquivos.");
  await newMonthIfSaved();
  S.busy = { done: 0, n: files.length, bad: 0, step: "Preparando o leitor de texto (na primeira vez baixa uns 5 MB)…" }; render();
  try { await tesseract(); } catch (e) { S.busy = null; tessP = null; render(); return toast("Não consegui abrir o leitor de texto. Verifique a internet e tente de novo."); }
  for (let i = 0; i < files.length; i++) {
    if (!alive()) return;
    S.busy.step = `Lendo ${files[i].name}`; renderBusy();
    try {
      const name = files[i].name;
      await store.put(name, files[i]); crops.clear();
      const reading = await readPrint(files[i], name);
      const r = call("add_page", name, JSON.stringify(reading));
      if (!r.ok) S.busy.bad++;
    } catch (e) { console.error(e); S.busy.bad++; }
    S.busy.done = i + 1; renderBusy();
  }
  persist(); S.busy = null;
  await refresh();
}
function renderBusy() {
  const b = S.busy, el = $("#busy"); if (!el) return;
  el.querySelector("i").style.width = (100 * b.done / b.n) + "%";
  el.querySelector(".n").textContent = `${b.done} de ${b.n}`;
  el.querySelector(".step").textContent = b.step || "";
}

/* ---------- render ---------- */
function render() {
  if (!alive()) return;
  const d = S.data;
  if (!d) return;
  root.innerHTML = `
    <div class="rtop"><div class="month">Mês do fechamento
      <button class="monthbtn" title="Trocar o mês"><span>${esc(d.month_label)}</span><span class="ms">expand_more</span><input type="month" id="monthinput" value="${esc(d.month.slice(0, 7))}" aria-label="Mês do fechamento"></button></div>
      <div id="topacts"></div></div>
    <div id="app"></div>
    <div class="foot" id="foot" hidden><div class="msg" id="footmsg"></div><div id="footbtns"></div></div>
    <input type="file" id="file" accept="image/*" multiple hidden>`;
  $("#monthinput").onchange = e => act({type:"set_month", month:e.target.value});
  $("#file").onchange = e => { readFiles(e.target.files); e.target.value = ""; };
  const app = $("#app");
  if (S.busy) {
    app.innerHTML = `<div class="reading" id="busy"><b>Lendo os prints…</b><p class="muted step"></p><div class="bar"><i></i></div><span class="muted money n">0 de ${S.busy.n}</span></div>`;
    renderBusy(); return;
  }
  if (d.status === "empty") { renderEmpty(d); return; }
  $("#topacts").innerHTML = `<button class="linkbtn" id="more"><span class="ms">add_photo_alternate</span>Adicionar prints</button><button class="linkbtn quiet" id="restart">Começar de novo</button>`;
  $("#more").onclick = () => $("#file").click();
  $("#restart").onclick = async () => { if (confirm("Apagar os prints e as edições deste mês e começar de novo? O que já está no FinTrack não muda.")) { await store.clear(); crops.clear(); act({type:"clear"}); } };

  const blocks = d.issues.filter(i => i.level === "block"), warns = d.issues.filter(i => i.level !== "block");
  let h = summaryHTML(d, blocks);
  if (blocks.length) h += `<h2 class="sec">Precisa de você <span class="count">${blocks.length}</span></h2>` + blocks.map(issueHTML).join("");
  if (warns.length) h += `<h2 class="sec">Avisos</h2>` + warns.map(issueHTML).join("");
  h += `<h2 class="sec">Ativos por banco</h2>` + d.banks.map(bankHTML).join("");
  h += `<div class="keys">${["proven","checked","user","review"].map(t => `<span><i class="dot ${t}"></i>${TRUST[t]}</span>`).join("")}
        <button class="linkbtn" id="addline" style="margin-left:auto">Adicionar linha sem print</button></div>
        <div id="addform"></div>`;
  h += `<h2 class="sec">Prints lidos <span class="muted" style="font-weight:500">${d.prints.length}</span>
        <button class="linkbtn" id="toggleprints">${S.showPrints ? "Esconder" : "Mostrar"}</button></h2>`;
  if (S.showPrints) h += `<div class="prints">${d.prints.map(printHTML).join("")}</div>`;
  app.innerHTML = h;
  bind(d);
  renderFoot(d, blocks);
  hydrate();
}

function renderEmpty(d) {
  const last = d.history.length ? d.history[d.history.length - 1] : null;
  $("#app").innerHTML = `
    <div class="drop" id="drop">
      <span class="ms big">document_scanner</span>
      <h2>Solte aqui os prints do mês</h2>
      <p>Todos os bancos de uma vez, em qualquer ordem. O FinTrack separa por banco, soma e confere com os totais que cada tela mostra. Os prints ficam só neste aparelho.</p>
      <button class="btn primary" id="pick"><span class="ms">add_photo_alternate</span>Escolher prints</button>
      <div class="expect">${last ? `Último mês no FinTrack: <b>${esc(last.label)}</b>, <span class="money">${brl(last.total)}</span>. Este mês será comparado com ele.` : `Ainda não há meses no seu patrimônio para comparar.`}</div>
    </div>`;
  $("#pick").onclick = () => $("#file").click();
  hydrate();
}

function summaryHTML(d, blocks) {
  const c = d.counts;
  let delta = "";
  if (d.delta !== null) {
    const pct = d.prev_total ? (100 * d.delta / d.prev_total) : 0;
    delta = `<div class="delta ${d.delta >= 0 ? "up" : "down"}">${signed(d.delta)} <span style="font-weight:500">(${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1).replace(".", ",")}%)</span><div class="muted" style="font:400 13px var(--txt)">desde ${esc(d.prev_label)}</div></div>`;
  }
  const okProofs = d.proofs.filter(p => p.ok).length;
  const verdict = blocks.length
    ? `<div class="verdict review"><span>●</span><div>${blocks.length === 1 ? "Falta 1 item" : `Faltam ${blocks.length} itens`} para fechar o mês<small>O total acima ainda pode mudar. Resolva a lista abaixo.</small></div></div>`
    : `<div class="verdict ok"><span>✓</span><div>Tudo conferido<small>${c.proven} valores batem com ${okProofs} totais mostrados pelos bancos${c.checked ? `, ${c.checked} foram lidos duas vezes com o mesmo resultado` : ""}${c.user ? `, ${c.user} informados por você` : ""}.</small></div></div>`;
  const bars = d.by_class.map(x => `<i style="width:${x.share * 100}%;background:${CLASS_COLOR[x.classification] || "#8492A0"}" title="${esc(x.classification)}"></i>`).join("");
  const legend = d.by_class.map(x => `<span><i class="sw" style="background:${CLASS_COLOR[x.classification] || "#8492A0"}"></i>${esc(x.classification)} <b class="money">${(x.share * 100).toFixed(1).replace(".", ",")}%</b></span>`).join("");
  return `<div class="sum"><div><div class="cap">Patrimônio em ${esc(d.month_label)}</div><div class="total money">${brl(d.total)}</div></div>${delta}${verdict}<div class="classes">${bars}</div><div class="legend">${legend}</div></div>`;
}

function issueHTML(it) {
  const soft = it.level !== "block" || it.kind === "missing_bank";
  let body = "";
  const picture = it.page ? `<img class="proof-img ${it.box && it.box.length ? "" : "thumb"}" src="${img(it.page, it.box, 860, it.kind === "sum" ? 1.2 : 2.4)}" alt="Trecho do print ${esc(it.page)}" data-zoom="${esc(it.page)}">` : "";
  if (it.kind === "check_value") {
    body = `${picture}<div class="acts">${(it.options || []).map(o => `<button class="btn small" data-setval="${it.row}" data-v="${o}">É ${brl(o)}</button>`).join("")}
      <input type="text" placeholder="outro valor" data-in="${it.row}" inputmode="decimal"><button class="btn small" data-setin="${it.row}">Usar este</button>
      <button class="linkbtn quiet" data-exclude="${it.row}">Tirar do total</button></div>`;
  } else if (it.kind === "manual_value") {
    const row = findRow(it.row);
    body = `<div class="acts"><input type="text" data-in="${it.row}" value="${row ? plain(row.Value) : ""}" inputmode="decimal"><button class="btn small go" data-setin="${it.row}">Confirmar valor</button>
      <button class="linkbtn quiet" data-exclude="${it.row}">Não contar este mês</button></div>`;
  } else if (it.kind === "unknown_print") {
    body = `${picture}<p style="margin-bottom:6px">Valores que achei neste print:</p><div class="acts" data-amounts="${esc(it.page)}">${(it.amounts || []).map((a, i) => `<button class="chip" data-amt="${a.value}">${brl(a.value)}</button>`).join("") || `<span class="muted">nenhum</span>`}</div>
      <div class="formgrid"><select data-f="inst">${["", ...it.institutions].map(o => `<option value="${esc(o)}">${o ? esc(o) : "Banco…"}</option>`).join("")}<option value="__other">Outro banco…</option></select>
      <input type="text" data-f="asset" placeholder="Nome do ativo"><select data-f="cls">${it.classes.map(o => `<option>${esc(o)}</option>`).join("")}</select><input type="text" data-f="val" placeholder="Valor" inputmode="decimal"></div>
      <div class="acts"><button class="btn small go" data-manual="${esc(it.page)}">Adicionar ao mês</button><button class="linkbtn quiet" data-ignore="${esc(it.page)}">Ignorar este print</button></div>`;
  } else if (it.kind === "bank_doubt") {
    body = `${picture}<div class="acts">${it.options.map(o => `<button class="btn small" data-bank="${esc(it.page)}" data-inst="${esc(o)}">É ${esc(o)}</button>`).join("")}<button class="linkbtn quiet" data-ignore="${esc(it.page)}">Ignorar este print</button></div>`;
  } else if (it.kind === "missing_bank") {
    body = `<div class="acts"><button class="btn small" id="more2" data-more="1">Adicionar o print</button><button class="linkbtn quiet" data-dismiss="${esc(it.key)}">Não tenho mais esse banco</button></div>`;
  } else if (it.kind === "print_error" || it.kind === "print_note") {
    body = `${picture}<div class="acts"><button class="linkbtn quiet" data-ignore="${esc(it.page)}">Ignorar este print</button></div>`;
  } else if (it.kind === "sum" && it.extra) {
    body = `${picture}<div class="acts"><button class="btn small" data-extra="${esc(it.proof)}" data-v="${it.extra}">Contar ${brl(it.extra)} como saldo em conta</button><button class="btn small" data-more="1">Adicionar o print que falta</button></div>`;
  } else {
    body = picture;
  }
  return `<div class="need ${soft ? "soft" : ""}"><h3>${esc(it.title)}</h3><p>${esc(it.detail)}</p>${body}</div>`;
}

function findRow(id) { for (const b of S.data.banks) for (const r of b.rows) if (r.id === id) return r; return null; }

function bankHTML(b) {
  const kept = b.rows.filter(r => !r.excluded);
  const open = S.openBank[b.inst] ?? (b.state === "review");
  const delta = b.prev !== null && b.prev > 0 ? `<span class="${b.total - b.prev >= 0 ? "up" : "down"}">${signed(b.total - b.prev)}</span> no mês` : (b.prev === 0 ? "novo este mês" : "");
  const okP = b.proofs.filter(p => p.ok), badP = b.proofs.filter(p => !p.ok);
  let tag = "";
  if (badP.length) tag = `<span class="tag warn">Soma não bate com a tela</span>`;
  else if (b.state === "review") tag = `<span class="tag warn">Precisa conferir</span>`;
  else if (okP.length) tag = `<span class="tag ok">✓ Soma bate com a tela</span>`;
  else tag = `<span class="tag ok">✓ Conferido</span>`;
  const rows = b.rows.map(r => rowHTML(r)).join("");
  const gone = b.gone.length ? `<div class="gone">Estava no mês passado e não apareceu agora: ${b.gone.map(g => `${esc(g.Asset)} (<span class="money">${brl(g.Value)}</span>)`).join(", ")}. Se venceu ou foi vendido, está certo.</div>` : "";
  return `<details class="bank" data-bank-block="${esc(b.inst)}" ${open ? "open" : ""}><summary>
    <div class="name">${esc(b.inst)} ${tag}</div><div class="tot money">${brl(b.total)}</div>
    <div class="sub" style="padding-left:20px">${kept.length} ${kept.length === 1 ? "ativo" : "ativos"}</div><div class="sub r">${delta}</div></summary>
    ${b.proofs.length ? `<div class="proofs">${b.proofs.map(p => `<div class="${p.ok ? "pok" : "pbad"}"><span>${p.ok ? "✓" : "●"}</span> ${esc(p.label)}: a tela mostra <b class="money">${brl(p.expected)}</b>${p.count_expected !== null ? ` em ${p.count_expected} ativos` : ""}, ${p.ok ? "e as linhas somam exatamente isso" : `e as linhas somam <b class="money">${brl(p.got)}</b>${p.count_got !== null && p.count_got !== p.count_expected ? ` em ${p.count_got}` : ""}`}.</div>`).join("")}</div>` : ""}
    <div class="rows">${rows}</div>${gone}</details>`;
}

function rowHTML(r) {
  const d = r.delta === null ? (r.is_new ? `<span class="muted">novo</span>` : "") : `<span class="${r.delta >= 0 ? "up" : "down"}">${signed(r.delta)}</span>`;
  let h = `<button class="row ${r.excluded ? "out" : ""}" data-row="${r.id}" aria-expanded="${!!S.open[r.id]}">
    <i class="dot ${r.trust}" title="${TRUST[r.trust]}"></i><div class="a"><b>${esc(r.Asset)}</b><span>${esc(r.Classification)}</span></div>
    <div class="v money">${brl(r.Value)}</div><div class="d">${d}</div></button>`;
  if (S.open[r.id]) {
    const d = S.data;
    h += `<div class="detail"><p class="why">${TRUST[r.trust]}.${r.prev !== null && r.prev !== undefined ? ` Mês passado: <span class="money">${brl(r.prev)}</span>.` : ""}${r.edited && !r.manual ? ` Lido no print: <span class="money">${brl(r.read_value)}</span>.` : ""}</p>
      ${r.page ? `<img class="proof-img" src="${img(r.page, r.box, 820, 3)}" alt="Trecho do print" data-zoom="${esc(r.page)}">` : ""}
      <div class="formgrid"><input type="text" data-e="Asset" value="${esc(r.Asset)}" aria-label="Nome"><select data-e="Classification" aria-label="Classe">${d.classes.map(c => `<option ${c === r.Classification ? "selected" : ""}>${esc(c)}</option>`).join("")}</select><input type="text" data-e="Value" value="${plain(r.Value)}" inputmode="decimal" aria-label="Valor"></div>
      <div class="acts"><button class="btn small primary" data-save="${r.id}">Salvar</button>
      <button class="linkbtn quiet" data-toggle-ex="${r.id}" data-ex="${r.excluded ? 0 : 1}">${r.excluded ? "Voltar a contar" : "Tirar do total"}</button>
      ${r.edited || r.excluded ? `<button class="linkbtn quiet" data-reset="${r.id}">Desfazer minhas mudanças</button>` : ""}
      ${r.manual ? `<button class="linkbtn quiet" data-rmmanual="${r.id}">Não usar mais esta linha</button>` : ""}</div></div>`;
  }
  return h;
}

function printHTML(p) {
  const off = p.status !== "used" && p.status !== "manual";
  const label = p.status === "used" ? (p.rows ? `${p.rows} ${p.rows === 1 ? "valor" : "valores"}` : "só o total") : p.what;
  return `<div class="pr ${off ? "off" : ""}"><img loading="lazy" src="${img(p.name, null, 200)}" alt="${esc(p.name)}" data-zoom="${esc(p.name)}"><b>${esc(p.inst || "?")}</b>${esc(label)}<button class="x" title="Remover este print" data-rmprint="${esc(p.name)}">×</button></div>`;
}


function bind(d) {
  const app = $("#app");
  app.querySelectorAll("details.bank").forEach(el => el.addEventListener("toggle", () => { S.openBank[el.dataset.bankBlock] = el.open; }));
  app.onclick = e => {
    const t = e.target.closest("[data-row],[data-setval],[data-setin],[data-exclude],[data-save],[data-toggle-ex],[data-reset],[data-ignore],[data-bank],[data-dismiss],[data-more],[data-manual],[data-amt],[data-zoom],[data-rmprint],[data-rmmanual],[data-extra]");
    if (!t) return;
    const ds = t.dataset;
    if (ds.zoom !== undefined) { e.preventDefault(); return zoom(ds.zoom); }
    if (ds.row !== undefined) { S.open[ds.row] = !S.open[ds.row]; return render(); }
    if (ds.setval !== undefined) return act({type:"set_row", id:ds.setval, Value:Number(ds.v)}, "Valor confirmado");
    if (ds.setin !== undefined) { const v = app.querySelector(`[data-in="${ds.setin}"]`).value; return act({type:"set_row", id:ds.setin, Value:v}, "Valor salvo"); }
    if (ds.exclude !== undefined) return act({type:"set_row", id:ds.exclude, excluded:true}, "Linha fora do total");
    if (ds.toggleEx !== undefined) return act({type:"set_row", id:ds.toggleEx, excluded:ds.ex === "1"});
    if (ds.reset !== undefined) return act({type:"reset_row", id:ds.reset}, "Voltou ao que foi lido");
    if (ds.save !== undefined) { const box = t.closest(".detail"); const g = k => box.querySelector(`[data-e="${k}"]`).value; return act({type:"set_row", id:ds.save, Asset:g("Asset"), Classification:g("Classification"), Value:g("Value")}, "Salvo"); }
    if (ds.ignore !== undefined) return act({type:"print", name:ds.ignore, ignore:true}, "Print ignorado");
    if (ds.bank !== undefined) return act({type:"print", name:ds.bank, inst:ds.inst});
    if (ds.dismiss !== undefined) return act({type:"dismiss", key:ds.dismiss});
    if (ds.extra !== undefined) return act({type:"add_extra", key:ds.extra, Value:Number(ds.v)}, "Saldo em conta adicionado");
    if (ds.more !== undefined) return $("#file").click();
    if (ds.rmprint !== undefined) { store.del(ds.rmprint); return act({type:"remove_print", name:ds.rmprint}, "Print removido"); }
    if (ds.rmmanual !== undefined) { const r = findRow(ds.rmmanual); return act({type:"remove_manual", Institution:r.Institution, Asset:r.Asset}); }
    if (ds.amt !== undefined) { const card = t.closest(".need"); card.querySelectorAll(".chip").forEach(c => c.classList.remove("on")); t.classList.add("on"); card.querySelector('[data-f="val"]').value = plain(Number(ds.amt)); return; }
    if (ds.manual !== undefined) {
      const card = t.closest(".need"), g = k => card.querySelector(`[data-f="${k}"]`).value.trim();
      let inst = g("inst"); if (inst === "__other") inst = (prompt("Nome do banco:") || "").trim();
      return act({type:"print", name:ds.manual, manual:[{Institution:inst, Asset:g("asset"), Classification:g("cls"), Value:g("val")}]}, "Adicionado");
    }
  };
  app.onkeydown = e => { if (e.key === "Enter" && e.target.matches("[data-in]")) act({type:"set_row", id:e.target.dataset.in, Value:e.target.value}, "Valor salvo");
                         if (e.key === "Enter" && e.target.matches("[data-e]")) e.target.closest(".detail").querySelector("[data-save]").click(); };
  $("#toggleprints").onclick = () => { S.showPrints = !S.showPrints; render(); };
  $("#addline").onclick = () => {
    $("#addform").innerHTML = `<div class="need soft" style="margin-top:10px"><h3>Linha sem print</h3><p>Para o que não aparece em nenhum app. Ela volta todo mês para você atualizar o valor.</p>
      <div class="formgrid"><input type="text" id="m_inst" placeholder="Banco" list="insts"><datalist id="insts">${d.institutions.map(i => `<option value="${esc(i)}">`).join("")}</datalist>
      <input type="text" id="m_asset" placeholder="Nome"><select id="m_cls">${d.classes.map(c => `<option>${esc(c)}</option>`).join("")}</select><input type="text" id="m_val" placeholder="Valor" inputmode="decimal"></div>
      <div class="acts"><button class="btn small go" id="m_ok">Adicionar</button></div></div>`;
    $("#m_ok").onclick = () => act({type:"add_manual", Institution:$("#m_inst").value, Asset:$("#m_asset").value, Classification:$("#m_cls").value, Value:$("#m_val").value}, "Linha adicionada");
    $("#m_inst").focus();
  };
}

function zoom(name) {
  const z = document.createElement("div"); z.className = "reader-zoom";
  z.innerHTML = `<img src="${img(name, null, 1400)}" alt="${esc(name)}">`;
  z.onclick = () => z.remove(); document.body.appendChild(z); hydrate(z);
}

function renderFoot(d, blocks) {
  $("#foot").hidden = false;
  const m = d.month_label.split(" ")[0];
  if (d.saved) $("#footmsg").innerHTML = `<b style="color:var(--ok)">${cap(m)} enviado.</b> Confira e salve na janela do FinTrack. O próximo mês será comparado com este.`;
  else if (blocks.length) $("#footmsg").textContent = `Resolva ${blocks.length === 1 ? "o item pendente" : `os ${blocks.length} itens pendentes`} antes de lançar.`;
  else $("#footmsg").textContent = `${d.n_rows} linhas prontas para o seu patrimônio.` + (d.month_exists ? ` ${cap(m)} já existe no FinTrack: lançar de novo substitui.` : "");
  $("#footbtns").innerHTML = `<button class="btn ${blocks.length ? "" : "primary"}" id="send"><span class="ms">check</span>${blocks.length ? "Lançar mesmo assim" : `Lançar ${m} no patrimônio`}</button>`;
  $("#send").onclick = async () => {
    if (blocks.length && !confirm(`Ainda há ${blocks.length} ${blocks.length === 1 ? "item" : "itens"} sem conferir. Lançar mesmo assim?`)) return;
    try {
      const bonds = opts.loadBonds ? await opts.loadBonds().catch(() => []) : [];
      const out = call("finish", JSON.stringify(bonds || []));
      afterChange(call("state"));
      const q = v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
      const csv = ["Date,Classification,Institution,Asset,Value,ValueCurve"].concat(out.rows.map(r =>
        [out.date, r.Classification, r.Institution, r.Asset, Number(r.Value).toFixed(2), r.ValueCurve == null || r.ValueCurve === "" ? "" : Number(r.ValueCurve).toFixed(2)].map(q).join(","))).join("\n");
      if (out.note) toast(out.note);
      opts.send(csv);
      refresh();
    } catch (e) { toast(e.message); }
  };
}

/* ---------- drag and drop anywhere on the page ---------- */
let dragDepth = 0;
const onPage = () => alive() && S.data && !S.busy;
window.addEventListener("dragenter", e => { if (!onPage()) return; e.preventDefault(); dragDepth++; root.classList.add("dragging"); });
window.addEventListener("dragleave", () => { if (!alive()) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) root.classList.remove("dragging"); });
window.addEventListener("dragover", e => { if (onPage()) e.preventDefault(); });
window.addEventListener("drop", e => { if (!onPage()) return; e.preventDefault(); dragDepth = 0; root.classList.remove("dragging"); if (e.dataTransfer.files.length) readFiles(e.dataTransfer.files); });
window.addEventListener("keydown", e => { if (e.key === "Escape") document.querySelectorAll(".reader-zoom").forEach(z => z.remove()); });

window.ReaderApp = {
  /** Reads one print and returns the raw reading (used by the tests). */
  _read: (blob, name) => readPrint(blob, name),
  /** el: where to draw. o: { uid, history: AssetEntry[], settings, saveSettings(s), loadBonds(), send(csvText) } */
  async start(el, o) {
    root = el; opts = o;
    root.innerHTML = `<div class="reading"><b>Preparando o fechamento…</b><p class="muted">Na primeira vez o app baixa o leitor (uns 15 MB). Depois abre na hora.</p></div>`;
    try {
      if (!W || uid !== (o.uid || "anon")) { uid = o.uid || "anon"; booting = booting || boot(); await booting; booting = null; }
      S.data = call("start", JSON.stringify(o.history || []), JSON.stringify(o.settings || {}));
      S.settingsSent = JSON.stringify(S.data.settings || {});
      persist(); render();
    } catch (e) {
      console.error(e);
      if (alive()) root.innerHTML = `<div class="reading"><b>Não consegui abrir o fechamento.</b><p class="muted">${esc(e.message)}</p><button class="btn" onclick="location.reload()">Tentar de novo</button></div>`;
    }
  },
};
})();
