/* Pages. Every page answers one question: which stocks are cheap and good right now, and why. */
"use strict";

const go = (h) => { if (location.hash === h) route(); else location.hash = h; };
const nm = (s) => esc(s.name !== s.ticker ? s.name : s.sector || "");
const star = (s) => `<button class="star${S.favs.has(s.ticker) ? " on" : ""}" data-star="${esc(s.ticker)}" aria-label="Favoritar ${esc(s.ticker)}" title="Favoritar">${S.favs.has(s.ticker) ? "★" : "☆"}</button>`;
const sigbar = (s) => `<span class="sigbar" data-tip="${esc((s.signals || []).filter((g) => g[1] !== null).map((g) => (g[1] ? "✓ " : "✕ ") + sigName(g)).join("<br>"))}">${(s.signals || []).filter((g) => g[1] !== null).sort((a, b) => b[1] - a[1]).map((g) => `<i class="${g[1] ? "y" : ""}"></i>`).join("")}<span>${s.sig_ok}/${s.sig_total}</span></span>`;
const sigLi = (title, detail, ok) => `<li><span class="mk ${ok === true ? "ok" : ok === false ? "no" : "na"}">${ok === true ? "✓" : ok === false ? "!" : "–"}</span><span><b>${esc(title)}</b>${detail ? `<span class="d">: ${esc(detail)}</span>` : ""}</span></li>`;
const counts = (list) => { const c = {}; for (const v of VORDER) c[v] = 0; for (const s of list) c[s.verdict] = (c[s.verdict] || 0) + 1; return c; };
const vbar = (c, total) => VORDER.filter((v) => c[v]).map((v) => `<i style="--c:${vcolor(v)};flex:${c[v]}${v === "evitar" ? ";opacity:.55" : ""}" data-tip="<b>${VERDICTS[v].l}</b><br>${c[v]} de ${total} ações"></i>`).join("");
const rfLabel = () => (S.market === "US" ? "Treasury de 10 anos" : "Selic");
const shade = (p) => (isNum(p) ? `background:color-mix(in srgb, var(--v-oportunidade) ${Math.round(Math.max(0, Math.min(1, p)) * 55)}%, transparent)` : "");
const notes = () => store.get("notes", {});
const QUAD = { x: 60, y: 55, labels: ["Boas, mas caras", "Baratas e boas", "Caras e fracas", "Baratas, com risco"] };

// ---------- filter bar shared by every page with charts ----------
function filterBar() {
  const f = S.f, n = nFilters(), all = inMarket(), list = all.filter(passF);
  const sectors = [...new Set(all.map((s) => s.sector).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  if (f.sector && !sectors.includes(f.sector)) { f.sector = ""; saveF(); }
  const sel = (k) => `<label>${FSEL[k][0]}<select data-fsel="${k}">${FSEL[k][1].map(([v, l]) => `<option value="${v}"${f[k] === v ? " selected" : ""}>${l}</option>`).join("")}</select></label>`;
  return `<div class="fbar">
    <div class="frow"><input type="search" id="fq" placeholder="Buscar código ou nome" value="${esc(f.q)}" aria-label="Buscar ação">
      <select id="fsec" aria-label="Setor"><option value="">Todos os setores</option>${sectors.map((k) => `<option${k === f.sector ? " selected" : ""}>${esc(k)}</option>`).join("")}</select>
      <button class="chip${S.fopen ? " on" : ""}" data-fopen aria-expanded="${S.fopen}">Filtros${n ? ` · ${n}` : ""}</button>
      <span class="spacer"></span><span class="fcount"><b>${list.length}</b> de ${all.length} ações</span>${n ? `<button class="linkbtn" data-fclear>Limpar filtros</button>` : ""}</div>
    ${S.fopen ? `<div class="fpanel">
      <div class="fgroup"><span class="flab">Veredito</span><div class="chips">${VORDER.map((v) => `<button class="chip${f.verdicts.includes(v) ? " on" : ""}" data-fv="${v}" data-tip="${esc(VERDICTS[v].d)}">${vdot(v)}${VERDICTS[v].l}</button>`).join("")}</div></div>
      <div class="fgroup"><span class="flab">Tamanho da empresa</span><div class="chips">${Object.entries(FSIZE).map(([k, l]) => `<button class="chip${f.size === k ? " on" : ""}" data-fsize="${k}">${l}</button>`).join("")}</div></div>
      <div class="fgroup fsel">${Object.keys(FSEL).map(sel).join("")}</div>
      <div class="fgroup"><span class="flab">Atalhos</span><div class="chips">${Object.entries(FTOG).map(([k, l]) => `<button class="chip${f[k] ? " on" : ""}" data-ft="${k}">${l}</button>`).join("")}</div></div>
      <p class="note">Os filtros valem para todos os gráficos e listas, em todas as páginas. As notas continuam comparando cada ação com o setor inteiro.</p></div>` : ""}</div>`;
}
const emptyMsg = `<p class="muted" style="padding:28px 0">Nenhuma ação com esses filtros. Tire um filtro para ver mais.</p>`;

// ---------- Hoje ----------
function viewHome() {
  const list = filtered(), c = counts(list), ops = list.filter((s) => s.verdict === "oportunidade").sort(byScore), n = ops.length;
  const r = S.market === "ALL" ? null : rf(S.market), m = S.meta.macro || {};
  const secs = {}; for (const s of list) (secs[s.sector || "Outros"] ||= []).push(s);
  const secRows = Object.entries(secs).map(([k, arr]) => ({ k, arr, c: counts(arr) })).sort((a, b) => b.c.oportunidade - a.c.oportunidade || b.arr.length - a.arr.length).slice(0, 12);
  const maxSec = Math.max(...secRows.map((q) => q.arr.length), 1);
  const mey = median(list.map((s) => (s.pe > 0 ? 1 / s.pe : null))), real = isNum(m.selic) && isNum(m.ipca_12m) ? (1 + m.selic) / (1 + m.ipca_12m) - 1 : null;
  const mov = list.filter((s) => isNum(s.d_score) && Math.abs(s.d_score) >= 0.5), h0 = Object.values(S.hist)[0], since = h0 && h0.length ? fmtDate(h0[0][0], true).slice(0, 5) : "";
  const movLi = (s) => `<li><a href="#/acao/${esc(s.ticker)}" data-st="${esc(s.ticker)}"><span><span class="tk">${esc(s.ticker)}</span><span class="nm">${nm(s)}</span></span><span class="sc ${s.d_score > 0 ? "up" : "down"}">${s.d_score > 0 ? "+" : ""}${x(s.d_score, 1)}</span></a></li>`;
  app.innerHTML = `
    <h1>${n ? `${n} ${n === 1 ? "ação" : "ações"} ${marketName()} ${n === 1 ? "está barata e boa" : "estão baratas e boas"} hoje.` : "Nenhuma ação passa em todos os critérios hoje."}</h1>
    <p class="lede">De ${list.length} ${nFilters() ? "dentro dos seus filtros" : "analisadas"}, ${n === 1 ? "é a que tem" : "são as que têm"} preço baixo contra o setor, retorno acima do custo de capital, nenhum alerta grave e a maioria dos sinais a favor. Outras ${c.barata_risco} parecem baratas, mas carregam risco.</p>
    ${filterBar()}
    ${list.length ? `<div class="vbar">${vbar(c, list.length)}</div>
    <div class="vlegend">${VORDER.map((v) => `<a href="#/explorar" data-vf="${v}" data-tip="${esc(VERDICTS[v].d)}">${vdot(v)}<b>${c[v]}</b> ${VERDICTS[v].pl}</a>`).join("")}</div>

    <section class="sec"><h2>Onde estão as melhores</h2>
      <p class="sub">Cada bolha é uma ação. Quanto mais à direita, mais barata; quanto mais alta, melhor a empresa. O tamanho é o valor de mercado. O canto verde é o que interessa.</p>
      <div class="cols"><div id="c-matrix"></div>
        <div><h3>As ${Math.min(10, n)} primeiras</h3><ol class="rank">${ops.slice(0, 10).map((s) => `<li><a href="#/acao/${esc(s.ticker)}" data-st="${esc(s.ticker)}"><span><span class="tk">${esc(s.ticker)}</span><span class="nm">${nm(s)}</span></span>${spark(s.spark)}<span class="sc">${x(s.final_score, 0)}</span></a></li>`).join("") || `<li class="muted" style="padding:10px 0">Nada por aqui hoje.</li>`}</ol>
          <p class="note">Ordenadas pelo score: 60% valor, 40% qualidade. <a href="#/explorar" data-vf="oportunidade">Ver todas</a></p></div></div>
    </section>

    ${n ? `<section class="sec"><h2>Por que estas</h2><p class="sub">Os motivos a favor e o que pesa contra cada uma, com o número por trás.</p>
      <div class="why">${ops.slice(0, 6).map((s) => `<article><header><a href="#/acao/${esc(s.ticker)}">${esc(s.ticker)}</a>${sigbar(s)}</header>
        <p class="meta">${esc(s.name !== s.ticker ? s.name + ", " : "")}${esc(s.sector || "")}</p>
        <ul class="sig">${pros(s, 3).map((g) => sigLi(SIGNALS[g[0]], g[2], true)).join("")}${cons(s, 2).map((g) => sigLi(g[0], g[1], false)).join("")}</ul></article>`).join("")}</div></section>

    <section class="sec"><h2>Raio-x das melhores</h2><p class="sub">As cinco dimensões de cada uma, de 0 a 100 contra o setor. Quanto mais verde, melhor. Uma linha toda verde é rara.</p>
      <div class="tablewrap"><table class="heat"><thead><tr><th class="l">Ação</th>${DIMS.map((d) => `<th>${d[1]}</th>`).join("")}<th>Score</th></tr></thead>
      <tbody>${ops.slice(0, 12).map((s) => `<tr data-t="${esc(s.ticker)}"><td class="l"><span class="tk">${esc(s.ticker)}</span><span class="nm">${nm(s)}</span></td>${DIMS.map(([k]) => { const v = s.dims ? s.dims[k] : null; return `<td class="num" style="${shade(isNum(v) ? v / 100 : null)}">${isNum(v) ? v : "–"}</td>`; }).join("")}<td class="num"><b>${x(s.final_score, 0)}</b></td></tr>`).join("")}</tbody></table></div></section>` : ""}

    <section class="sec"><div class="cols even">
      <div><h2>Por setor</h2><p class="sub">Quantas ações de cada tipo há em cada setor. Os setores com mais baratas e boas vêm primeiro.</p>
        <div class="hbars">${secRows.map((q) => `<a class="hbar" href="#/explorar" data-sector="${esc(q.k)}"><span class="l">${esc(q.k)}</span><span class="b" style="width:${Math.max(6, (q.arr.length / maxSec) * 100)}%">${vbar(q.c, q.arr.length)}</span><span class="n">${q.c.oportunidade} de ${q.arr.length}</span></a>`).join("")}</div></div>
      <div><h2>O mercado está barato?</h2><p class="sub">Quanto o lucro operacional rende sobre o valor da empresa (EBIT ÷ EV).${isNum(r) ? ` Em verde, as ações que rendem mais que a ${rfLabel()}.` : ""}</p>
        <div id="c-hist"></div></div>
    </div></section>

    <section class="sec"><h2>O pano de fundo</h2><p class="sub">Ação só vale o risco se pagar mais que a renda fixa. Estes são os números de hoje.</p>
      <div class="kv">
        <div><div class="k">Selic</div><div class="v num">${pct(m.selic, 2)}</div><div class="h">juro básico do Brasil, ao ano</div></div>
        <div><div class="k">Juro real no Brasil</div><div class="v num">${pct(real, 1)}</div><div class="h">Selic descontada a inflação de ${pct(m.ipca_12m, 1)}</div></div>
        <div><div class="k">Treasury de 10 anos</div><div class="v num">${pct(m.us10y, 2)}</div><div class="h">juro de referência dos EUA</div></div>
        <div><div class="k">Lucro sobre o preço, ação mediana</div><div class="v num">${pct(mey, 1)}</div><div class="h">${isNum(r) && isNum(mey) ? `${NF[1].format(Math.abs(mey - r) * 100)} p.p. ${mey >= r ? "acima" : "abaixo"} da ${rfLabel()}` : "1 ÷ P/L"}</div></div>
      </div></section>

    ${mov.length ? `<section class="sec"><h2>O que mudou desde ${since}</h2><p class="sub">Quem mais ganhou e perdeu pontos no score. O score muda quando o preço anda ou quando sai balanço novo.</p>
      <div class="cols even"><div><h3>Subiram</h3><ol class="rank wide">${mov.filter((s) => s.d_score > 0).sort((a, b) => b.d_score - a.d_score).slice(0, 5).map(movLi).join("") || `<li class="muted" style="padding:10px 0">Nenhuma.</li>`}</ol></div>
      <div><h3>Caíram</h3><ol class="rank wide">${mov.filter((s) => s.d_score < 0).sort((a, b) => a.d_score - b.d_score).slice(0, 5).map(movLi).join("") || `<li class="muted" style="padding:10px 0">Nenhuma.</li>`}</ol></div></div></section>` : ""}` : emptyMsg}`;
  mount("c-matrix", (w) => scatter(list, w, { x: "value_score", y: "quality_score", quad: QUAD, labels: w < 520 ? 5 : 10 }));
  mount("c-hist", (w) => histogram(list, w, "ey", { lo: 0, hi: 0.4, step: 0.02, ref: r, refLabel: isNum(r) ? `${rfLabel()} ${pct(r, 2)}` : "" }));
}

// ---------- Mapa ----------
const MAP_PRESETS = {
  matriz: ["Valor × qualidade", "value_score", "quality_score", "Direita = mais barata contra o setor. Alto = empresa melhor. O canto verde junta as duas coisas."],
  magica: ["Barata × rentável", "ey", "roic", "A ideia da Fórmula Mágica de Greenblatt: lucro operacional alto sobre o preço (direita) e retorno alto sobre o capital (alto)."],
  dividendos: ["Dividendos × dívida", "dy", "net_debt_ebitda", "Dividendo alto só vale com dívida baixa. Procure à direita e embaixo."],
  desconto: ["Desconto × tendência", "graham_gap", "ret_12m", "Direita = preço abaixo do número de Graham. Embaixo = o preço caiu em 12 meses: pode ser oportunidade ou problema."],
  plroe: ["P/L × ROE", "pe", "roe", "Esquerda = paga pouco pelo lucro. Alto = lucro alto sobre o patrimônio. Procure à esquerda e em cima."],
  promocao: ["Boas em promoção", "drawdown", "quality_score", "Esquerda = caiu muito desde a máxima do ano. Alto = empresa boa. Em cima e à esquerda estão as boas que o mercado puniu."],
  crescimento: ["Crescimento × preço", "ni_cagr5", "pe", "Direita = lucro crescendo rápido em 5 anos. Embaixo = P/L baixo. Crescimento barato fica à direita e embaixo."],
  tamanho: ["Tamanho × valor", "mcap", "value_score", "Esquerda = empresas pequenas, direita = gigantes. Alto = mais barata. Mostra se as pechinchas estão nas pequenas ou nas grandes."],
};
function viewMap() {
  const list = filtered(), m = S.map, pre = MAP_PRESETS[m.preset], dk = m.dist || (m.dist = "pe");
  const opt = (sel) => Object.entries(METRICS).filter(([k]) => k !== "final_score").map(([k, v]) => `<option value="${k}"${k === sel ? " selected" : ""}>${esc(v.short || v.l)}</option>`).join("");
  const dom = domainOf(list, dk), r = S.market === "ALL" ? null : rf(S.market);
  app.innerHTML = `
    <h1>O mercado em um mapa.</h1>
    <p class="lede">Escolha uma forma de olhar. A cor é sempre o veredito; o tamanho da bolha é o valor de mercado. Passe o mouse para ver os números e clique para abrir a ação.</p>
    ${filterBar()}
    ${list.length ? `<section class="sec tight">
      <div class="chips">${Object.entries(MAP_PRESETS).map(([k, v]) => `<button class="chip${m.preset === k ? " on" : ""}" data-mp="${k}">${v[0]}</button>`).join("")}</div>
      <div class="controls"><label>Horizontal <select id="mx">${opt(m.x)}</select></label><label>Vertical <select id="my">${opt(m.y)}</select></label></div>
      ${pre ? `<p class="sub">${pre[3]}</p>` : ""}
      <div id="c-map"></div>
      <div class="vlegend">${VORDER.map((v) => `<a>${vdot(v)}${VERDICTS[v].l}</a>`).join("")}</div>
      <p class="note">Valores extremos ficam presos na borda do gráfico para não esmagar o resto. Ações sem o dado de um dos eixos não aparecem. Use o filtro de veredito para esconder grupos.</p>
    </section>
    <section class="sec"><h2>Tamanho e veredito</h2><p class="sub">Cada retângulo é uma empresa, agrupada por setor. A área é o valor de mercado. Verde forte é barata e boa.</p><div id="c-tree"></div></section>
    <section class="sec"><h2>Como um indicador se distribui</h2><p class="sub">Escolha um indicador e veja onde a maioria das ações está. Ajuda a saber se um número é normal ou fora da curva.</p>
      <div class="controls"><label>Indicador <select id="mdist">${opt(dk)}</select></label><span class="muted">Mediana: <b style="color:var(--ink)">${METRICS[dk].f(median(list.map((s) => mget(dk, s))))}</b></span></div>
      <div id="c-dist"></div></section>` : emptyMsg}`;
  mount("c-map", (w) => scatter(list, w, { x: m.x, y: m.y, quad: m.x === "value_score" && m.y === "quality_score" ? QUAD : null, labels: w < 520 ? 6 : 14, h: Math.round(Math.min(640, Math.max(340, w * 0.56))) }));
  mount("c-tree", (w) => treemap(list, w));
  mount("c-dist", (w) => histogram(list, w, dk, { lo: dom[0], hi: dom[1], step: (dom[1] - dom[0]) / 24, ref: dk === "ey" || dk === "dy" ? r : null, refLabel: isNum(r) ? `${rfLabel()} ${pct(r, 2)}` : "" }));
}

// ---------- Rankings ----------
const noGrave = (s) => !(s.flags || []).some((f) => GRAVE.includes(f));
const RANKS = [
  ["Baratas e boas", "O ranking principal: maior score entre as que passam em tudo.", (l) => l.filter((s) => s.verdict === "oportunidade").sort(byScore), (s) => x(s.final_score, 0)],
  ["Dividendos que se sustentam", "Maior dividend yield entre as que pagam com regularidade, sem dívida pesada e sem pagar mais do que lucram.", (l) => l.filter((s) => (sigOf(s, "dividendos") || [])[1] === true && (sigOf(s, "divida") || [])[1] !== false && noGrave(s) && !(s.payout > 1)).sort((a, b) => b.dy - a.dy), (s) => pct(s.dy)],
  ["Maior desconto para Graham", "Preço mais abaixo do número de Graham, só entre empresas de qualidade 50 ou mais.", (l) => l.filter((s) => mget("graham_gap", s) > 0 && s.quality_score >= 50 && noGrave(s)).sort((a, b) => mget("graham_gap", b) - mget("graham_gap", a)), (s) => pct(mget("graham_gap", s), 0)],
  ["Fórmula Mágica", "A soma de barata (EBIT ÷ EV) com rentável (ROIC), de Joel Greenblatt.", (l) => l.filter((s) => isNum(s.magic_rank)).sort((a, b) => a.magic_rank - b.magic_rank), (s) => x(s.magic_rank, 0) + "º"],
  ["Boas em promoção", "Empresas de qualidade 65 ou mais que mais caíram desde a máxima de 52 semanas.", (l) => l.filter((s) => s.quality_score >= 65 && noGrave(s) && isNum(s.drawdown)).sort((a, b) => a.drawdown - b.drawdown), (s) => pct(s.drawdown, 0)],
  ["Baratas e subindo", "Valor 60 ou mais e preço acima da média de 200 dias: o mercado já começou a notar.", (l) => l.filter((s) => s.value_score >= 60 && s.vs_ma200 > 0 && noGrave(s) && isNum(s.ret_12m)).sort((a, b) => b.ret_12m - a.ret_12m), (s) => spct(s.ret_12m)],
  ["Crescimento a preço razoável", "Menor P/L dividido pelo crescimento do lucro em 5 anos (PEG), com qualidade 50 ou mais. O crescimento conta até 30% ao ano.", (l) => l.filter((s) => s.pe > 0 && s.ni_cagr5 > 0.03 && s.quality_score >= 50).map((s) => ((s._peg = s.pe / (Math.min(s.ni_cagr5, 0.3) * 100)), s)).sort((a, b) => a._peg - b._peg), (s) => x(s._peg, 2)],
  ["Mais rentáveis", "Maior retorno sobre o capital, sem alerta grave e sem ROE inflado por dívida.", (l) => l.filter((s) => isNum(ret(s)) && noGrave(s) && !(s.flags || []).includes("roe_alavancado")).sort((a, b) => ret(b) - ret(a)), (s) => pct(ret(s), 0)],
  ["Maior prêmio sobre a renda fixa", "Rendimento do lucro (1 ÷ P/L) menos o juro da renda fixa, com lucro em todos os anos.", (l) => l.filter((s) => s.ey_gap > 0 && (sigOf(s, "estavel") || [])[1] === true && !(s.flags || []).includes("pl_muito_baixo")).sort((a, b) => b.ey_gap - a.ey_gap), (s) => METRICS.ey_gap.f(s.ey_gap)],
];
function viewRanks() {
  const list = filtered();
  app.innerHTML = `
    <h1>Nove jeitos de procurar.</h1>
    <p class="lede">Cada lista segue uma estratégia clássica de investimento em valor. Uma ação que aparece em várias listas merece mais atenção.</p>
    ${filterBar()}
    ${list.length ? (() => {
      const made = RANKS.map(([t, d, fn, val]) => [t, d, fn(list).slice(0, 7), val]), seen = {};
      for (const m of made) for (const s of m[2]) seen[s.ticker] = (seen[s.ticker] || 0) + 1;
      const multi = Object.entries(seen).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 8);
      return `${multi.length ? `<section class="sec tight"><h2>Aparecem em três listas ou mais</h2><div class="chips" style="margin-top:14px">${multi.map(([t, n]) => `<a class="chip" href="#/acao/${esc(t)}" data-st="${esc(t)}">${vdot(S.byTicker[t].verdict)}<b style="color:var(--ink)">${esc(t)}</b> ${n} listas</a>`).join("")}</div></section>` : ""}
      <section class="sec${multi.length ? "" : " tight"}"><div class="rkgrid">${made.map(([t, d, l, val]) => `<div><h3>${t}</h3><p class="note rkd">${d}</p><ol class="rank wide">${l.map((s) => `<li><a href="#/acao/${esc(s.ticker)}" data-st="${esc(s.ticker)}"><span><span class="tk">${vdot(s.verdict)} ${esc(s.ticker)}</span><span class="nm">${nm(s)}</span></span><span class="sc">${val(s)}</span></a></li>`).join("") || `<li class="muted" style="padding:10px 0">Nenhuma ação passa neste critério.</li>`}</ol></div>`).join("")}</div></section>`;
    })() : emptyMsg}`;
}

// ---------- Dividendos ----------
function viewDiv() {
  const list = filtered().filter((s) => s.dy > 0), r = S.market === "ALL" ? null : rf(S.market);
  const safe = RANKS[1][2](list).slice(0, 15);
  app.innerHTML = `
    <h1>Dividendo bom é o que se repete.</h1>
    <p class="lede">Yield alto pode ser um pagamento extraordinário ou um preço que desabou. Aqui o dividendo é cruzado com o lucro que o sustenta, a dívida e o histórico de pagamento.</p>
    ${filterBar()}
    ${list.length ? `<section class="sec tight"><h2>Quanto paga e quanto do lucro isso consome</h2>
      <p class="sub">Direita = paga mais sobre o preço. Alto = distribui uma parte maior do lucro. Acima de 100%, a empresa paga mais do que ganha: não dura. Quem passa de 200% fica preso no topo.</p>
      <div id="c-div"></div></section>
    <section class="sec"><div class="cols even">
      <div><h2>Quantas pagam mais que a renda fixa?</h2><p class="sub">Distribuição do dividend yield das ${list.length} pagadoras.${isNum(r) ? ` A linha é a ${rfLabel()}.` : ""}</p><div id="c-dyh"></div></div>
      <div><h2>Regularidade</h2><p class="sub">Direita = pagou em mais anos do histórico. Alto = yield maior. Em cima e à direita estão as pagadoras fiéis.</p><div id="c-dyr"></div></div>
    </div></section>
    <section class="sec"><h2>As que se sustentam</h2><p class="sub">Pagam com regularidade, a dívida está sob controle, não têm alerta grave e o dividendo cabe no lucro. O teto de Bazin é o preço máximo para receber 6% ao ano.</p>
      ${safe.length ? `<div class="tablewrap"><table><thead><tr><th class="l">Ação</th><th class="l">Veredito</th><th>Yield</th><th>Payout</th><th>Anos pagando</th><th>Dív/EBITDA</th><th>Preço</th><th>Teto de Bazin</th><th>Folga</th></tr></thead>
      <tbody>${safe.map((s) => { const gap = s.bazin_price > 0 ? s.bazin_price / s.price - 1 : null; return `<tr data-t="${esc(s.ticker)}"><td class="l">${star(s)} <span class="tk">${esc(s.ticker)}</span><span class="nm">${nm(s)}</span></td><td class="l">${pill(s.verdict)}</td><td class="num"><b>${pct(s.dy)}</b></td><td class="num">${pct(s.payout, 0)}</td><td class="num">${isNum(s.div_years) && s.hist_years ? `${s.div_years} de ${s.hist_years}` : "–"}</td><td class="num">${s.is_financial ? "–" : x(s.net_debt_ebitda)}</td><td class="num">${money(s.price, s.currency)}</td><td class="num">${money(s.bazin_price, s.currency)}</td><td class="num ${gap >= 0 ? "up" : "down"}">${spct(gap)}</td></tr>`; }).join("")}</tbody></table></div>` : `<p class="muted">Nenhuma ação passa nestes critérios com os filtros atuais.</p>`}</section>` : emptyMsg}`;
  mount("c-div", (w) => scatter(list.filter((s) => isNum(s.payout)), w, { x: "dy", y: "payout", hline: { at: 1, label: "100% do lucro" }, labels: w < 520 ? 4 : 8, h: Math.round(Math.min(520, Math.max(320, w * 0.46))) }));
  mount("c-dyh", (w) => histogram(list, w, "dy", { lo: 0, hi: 0.2, step: 0.01, ref: r, refLabel: isNum(r) ? `${rfLabel()} ${pct(r, 2)}` : "" }));
  mount("c-dyr", (w) => scatter(list, w, { x: "div_share", y: "dy", h: 300 }));
}

// ---------- Explorar ----------
const PRESETS = {
  graham_pass: ["Graham defensivo", (s) => s.graham_pass, "Passa em todos os testes do investidor defensivo de Graham que têm dado."],
  graham_ent: ["Graham empreendedor", (s) => s.graham_ent, "Critérios mais soltos de Graham para quem aceita mais trabalho."],
  net_net: ["Net-net", (s) => s.net_net, "Preço abaixo do capital de giro líquido: a pechincha clássica de Graham."],
  magic: ["Fórmula Mágica", (s) => isNum(s.magic_rank) && s.magic_rank <= 30, "As 30 primeiras na soma de barata (EBIT ÷ EV) com rentável (ROIC), de Greenblatt."],
  bazin: ["Bazin", (s) => isNum(s.bazin_price) && s.price > 0 && s.price <= s.bazin_price, "Preço abaixo do teto de Bazin: dividendo de pelo menos 6% ao ano."],
};
const mcol = (k, label, d = 1, dir = -1) => [label || METRICS[k].short || METRICS[k].l, "", (s) => mget(k, s), (s) => { const v = mget(k, s); return v === null ? "–" : METRICS[k].f(v); }, dir];
const COL = {
  ticker: ["Ação", "l", (s) => s.ticker, (s) => `${star(s)} <span class="tk">${esc(s.ticker)}</span><span class="nm">${nm(s)}</span>`, 1],
  verdict: ["Veredito", "l", (s) => -VORDER.indexOf(s.verdict), (s) => pill(s.verdict), -1],
  final_score: ["Score", "", (s) => s.final_score, (s) => `<span class="scorebar"><i><b style="width:${s.final_score || 0}%"></b></i>${x(s.final_score, 0)}</span>`, -1],
  value_score: ["Valor", "", (s) => s.value_score, (s) => x(s.value_score, 0), -1], quality_score: ["Qualidade", "", (s) => s.quality_score, (s) => x(s.quality_score, 0), -1],
  sig: ["Sinais", "l", (s) => (s.sig_total ? s.sig_ok / s.sig_total : null), (s) => sigbar(s), -1],
  pe: mcol("pe", "P/L", 1, 1), pe_avg3: mcol("pe_avg3", "P/L 3 anos", 1, 1), pb: mcol("pb", "P/VP", 2, 1), ev_ebit: mcol("ev_ebit", "EV/EBIT", 1, 1),
  ev_ebitda: ["EV/EBITDA", "", (s) => (s.ev_ebitda > 0 ? s.ev_ebitda : null), (s) => (s.ev_ebitda > 0 ? x(s.ev_ebitda) : "–"), 1], ps: ["P/Receita", "", (s) => (s.ps > 0 ? s.ps : null), (s) => (s.ps > 0 ? x(s.ps, 2) : "–"), 1],
  graham_gap: mcol("graham_gap", "Desconto Graham"), ey_gap: mcol("ey_gap", "Prêmio renda fixa"), dy: mcol("dy", "DY"), payout: mcol("payout", "Payout", 0, 1),
  div_share: ["Anos pagando", "", (s) => s.div_share, (s) => (isNum(s.div_years) && s.hist_years ? `${s.div_years}/${s.hist_years}` : "–"), -1],
  bazin: ["Folga p/ Bazin", "", (s) => (s.bazin_price > 0 && s.price > 0 ? s.bazin_price / s.price - 1 : null), (s) => (s.bazin_price > 0 && s.price > 0 ? spct(s.bazin_price / s.price - 1) : "–"), -1],
  ret: ["ROIC/ROE", "", (s) => ret(s), (s) => pct(ret(s), 0), -1], ebit_margin: mcol("ebit_margin", "Margem EBIT"), net_margin: ["Margem líq.", "", (s) => s.net_margin, (s) => pct(s.net_margin, 0), -1],
  net_debt_ebitda: ["Dív/EBITDA", "", (s) => (s.is_financial ? null : s.net_debt_ebitda), (s) => (s.is_financial ? "–" : x(s.net_debt_ebitda)), 1],
  coverage: ["Cob. juros", "", (s) => s.coverage, (s) => (isNum(s.coverage) ? (s.coverage >= 50 ? "50+" : x(s.coverage)) : "–"), -1], current_ratio: ["Liq. corrente", "", (s) => s.current_ratio, (s) => x(s.current_ratio, 2), -1],
  ni_cagr5: mcol("ni_cagr5", "Lucro 5a"), rev_cagr5: mcol("rev_cagr5", "Receita 5a"),
  price: ["Preço", "", (s) => s.price, (s) => money(s.price, s.currency), -1],
  range52: ["Faixa 52 sem.", "l", (s) => s.pos_52w, (s) => (isNum(s.pos_52w) ? `<span class="rng" data-tip="Mínima ${money(s.lo_52w, s.currency)}<br>Máxima ${money(s.hi_52w, s.currency)}"><i style="left:${Math.round(s.pos_52w * 100)}%"></i></span>` : "–"), -1],
  ret_12m: ["12 meses", "", (s) => s.ret_12m, (s) => `<span style="display:inline-flex;gap:8px;align-items:center">${spark(s.spark, 44, 18)}<span class="${s.ret_12m >= 0 ? "up" : "down"}">${spct(s.ret_12m)}</span></span>`, -1],
  vs_ma200: ["vs média 200d", "", (s) => s.vs_ma200, (s) => `<span class="${s.vs_ma200 >= 0 ? "up" : "down"}">${spct(s.vs_ma200)}</span>`, -1], drawdown: mcol("drawdown", "Desde a máxima", 0, 1),
  mcap: ["Tamanho", "", (s) => s.market_cap, (s) => big(s.market_cap, s.currency), -1], liquidity: ["Liquidez/dia", "", (s) => s.liquidity, (s) => big(s.liquidity, s.currency), -1],
};
const COLSETS = {
  resumo: ["Resumo", ["value_score", "quality_score", "sig", "pe", "dy", "ret", "ret_12m"]],
  valuation: ["Preço e valor", ["pe", "pe_avg3", "pb", "ev_ebit", "ev_ebitda", "ps", "graham_gap", "ey_gap"]],
  qualidade: ["Qualidade", ["ret", "ebit_margin", "net_margin", "net_debt_ebitda", "coverage", "current_ratio", "ni_cagr5", "rev_cagr5"]],
  dividendos: ["Dividendos", ["dy", "payout", "div_share", "bazin", "net_debt_ebitda"]],
  preco: ["Cotação", ["price", "range52", "ret_12m", "vs_ma200", "drawdown", "mcap", "liquidity"]],
};
const exCols = () => ["ticker", "verdict", "final_score"].concat(COLSETS[S.ex.set || "resumo"][1]);
function exList() {
  const e = S.ex, col = COL[e.sort[0]] || COL.final_score, dir = e.sort[1];
  return filtered().filter((s) => !e.preset || PRESETS[e.preset][1](s)).map((s) => [s, col[2](s)]).sort((a, b) => {
    const bad = (v) => v === null || v === undefined || (typeof v === "number" && !isFinite(v)), na = bad(a[1]), nb = bad(b[1]);
    if (na || nb) return na - nb || a[0].ticker.localeCompare(b[0].ticker);
    return (typeof a[1] === "string" ? a[1].localeCompare(b[1]) : a[1] - b[1]) * dir || a[0].ticker.localeCompare(b[0].ticker);
  }).map((p) => p[0]);
}
function drawTable() {
  const el = $("#extable"); if (!el) return;
  const list = exList(), e = S.ex, rows = list.slice(0, e.shown), cols = exCols();
  el.innerHTML = `${e.preset ? `<p class="note" style="margin:0 0 12px">${list.length} ${list.length === 1 ? "ação" : "ações"}. ${PRESETS[e.preset][2]}</p>` : ""}
    ${list.length ? `<div class="tablewrap"><table><thead><tr>${cols.map((k) => `<th class="${COL[k][1]}${e.sort[0] === k ? " sorted" : ""}" data-sort="${k}"${GLOSS[k] ? ` data-tip="${esc(GLOSS[k])}"` : ""} aria-sort="${e.sort[0] === k ? (e.sort[1] > 0 ? "ascending" : "descending") : "none"}">${COL[k][0]}${e.sort[0] === k ? (e.sort[1] > 0 ? " ↑" : " ↓") : ""}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((s) => `<tr data-t="${esc(s.ticker)}">${cols.map((k) => `<td class="${COL[k][1]} num">${COL[k][3](s)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
    ${list.length > rows.length ? `<button class="btn more" data-more>Mostrar mais ${Math.min(60, list.length - rows.length)}</button>` : ""}` : emptyMsg}`;
}
function viewExplore() {
  const e = S.ex;
  app.innerHTML = `
    <h1>Todas as ações, do seu jeito.</h1>
    <p class="lede">Escolha um grupo de colunas, ordene clicando no título e abra a ação clicando na linha. Passe o mouse no título de uma coluna para ver o que ela significa.</p>
    ${filterBar()}
    <section class="sec tight">
      <div class="controls"><span class="flab">Colunas</span><div class="chips" style="margin:0">${Object.entries(COLSETS).map(([k, v]) => `<button class="chip${(e.set || "resumo") === k ? " on" : ""}" data-set="${k}">${v[0]}</button>`).join("")}</div><span class="spacer"></span><button class="btn" data-csv>Baixar planilha (CSV)</button></div>
      <div class="controls"><span class="flab">Métodos clássicos</span><div class="chips" style="margin:0">${Object.entries(PRESETS).map(([k, v]) => `<button class="chip${e.preset === k ? " on" : ""}" data-preset="${k}" data-tip="${esc(v[2])}">${v[0]}</button>`).join("")}</div></div>
      <div id="extable"></div>
    </section>`;
  drawTable();
}

// ---------- Setores ----------
const HEAT = [["pe", "P/L", "low"], ["pb", "P/VP", "low"], ["ev_ebit", "EV/EBIT", "low"], ["dy", "DY", "high"], ["retk", "ROIC/ROE", "high"], ["ebit_margin", "Margem EBIT", "high"], ["net_debt_ebitda", "Dív/EBITDA", "low"], ["ret_12m", "12 meses", "high"], ["final_score", "Score", "high"]];
METRICS.retk = { l: "ROIC/ROE", get: (s) => ret(s), f: (v) => pct(v, 0) };
function viewSectors() {
  const groups = {}; for (const s of filtered()) (groups[s.market + "|" + (s.sector || "Outros")] ||= []).push(s);
  const rows = Object.entries(groups).map(([k, arr]) => ({ mkt: k.split("|")[0], sector: k.split("|")[1], arr, med: median(arr.map((s) => s.final_score)), ops: arr.filter((s) => s.verdict === "oportunidade").length }))
    .filter((r) => r.arr.length >= 3).sort((a, b) => b.ops - a.ops || (b.med || 0) - (a.med || 0));
  const best = rows[0], st = S.sec || (S.sec = { sort: "final_score", dir: -1 });
  for (const r of rows) { r.m = {}; for (const [k] of HEAT) r.m[k] = median(r.arr.map((s) => (s.is_financial && ["ev_ebit", "ebit_margin", "net_debt_ebitda"].includes(k) ? null : mget(k, s)))); }
  const rank = {}; for (const [k, , dir] of HEAT) { const vals = rows.map((r) => r.m[k]).filter(isNum).sort((a, b) => a - b); rank[k] = (v) => (isNum(v) && vals.length > 1 ? ((dir === "low" ? vals.length - 1 - vals.indexOf(v) : vals.indexOf(v)) / (vals.length - 1)) : null); }
  const hrows = rows.slice().sort((a, b) => (st.sort === "sector" ? a.sector.localeCompare(b.sector) * st.dir : ((isNum(a.m[st.sort]) ? a.m[st.sort] : -1e18 * st.dir) - (isNum(b.m[st.sort]) ? b.m[st.sort] : -1e18 * st.dir)) * st.dir));
  app.innerHTML = `
    <h1>${best && best.ops ? `${esc(best.sector)} é onde há mais ações baratas e boas.` : "Os setores lado a lado."}</h1>
    <p class="lede">Compare setores antes de comparar ações: um P/L de 8 é caro para um banco e barato para uma empresa de tecnologia.</p>
    ${filterBar()}
    ${rows.length ? `<section class="sec tight"><h2>Onde estão as boas notas</h2><p class="sub">Cada ponto é uma ação, posicionada pelo score final. O traço preto é a mediana do setor. À direita, quantas estão baratas e boas. Clique no nome do setor para ver as ações dele.</p>
      <div id="c-strips"></div><div class="vlegend" style="margin-top:20px">${VORDER.map((v) => `<a>${vdot(v)}${VERDICTS[v].l}</a>`).join("")}</div></section>
    <section class="sec"><h2>O número típico de cada setor</h2><p class="sub">A mediana de cada indicador por setor. Quanto mais verde, melhor o setor naquele indicador. Clique no título de uma coluna para ordenar.</p>
      <div class="tablewrap"><table class="heat"><thead><tr><th class="l${st.sort === "sector" ? " sorted" : ""}" data-hsort="sector">Setor</th><th>Ações</th>${HEAT.map(([k, l]) => `<th class="${st.sort === k ? "sorted" : ""}" data-hsort="${k}"${GLOSS[k] ? ` data-tip="${esc(GLOSS[k])}"` : ""}>${l}${st.sort === k ? (st.dir > 0 ? " ↑" : " ↓") : ""}</th>`).join("")}</tr></thead>
      <tbody>${hrows.map((r) => `<tr data-sector="${esc(r.sector)}" data-smkt="${r.mkt}"><td class="l">${esc(r.sector)}</td><td class="num muted">${r.arr.length}</td>${HEAT.map(([k]) => `<td class="num" style="${shade(rank[k](r.m[k]))}">${isNum(r.m[k]) ? METRICS[k].f(r.m[k]) : "–"}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
      <p class="note">O score compara cada ação com as do mesmo setor, então um setor inteiro caro não aparece como "barato" pelo score: use as colunas de múltiplos para isso. Setores com menos de 3 ações ficam de fora.</p></section>` : emptyMsg}`;
  mount("c-strips", (w) => strips(rows, w));
}

// ---------- Comparar ----------
const CMP_ROWS = [["final_score", "Score final", "high"], ["value_score", "Valor", "high"], ["quality_score", "Qualidade", "high"], ["sig", "Sinais a favor", "high"], ["pe", "P/L", "low"], ["pe_avg3", "P/L no lucro de 3 anos", "low"], ["pb", "P/VP", "low"], ["ev_ebit", "EV/EBIT", "low"], ["graham_gap", "Desconto para Graham", "high"], ["dy", "Dividend yield", "high"], ["payout", "Payout", ""], ["retk", "ROIC ou ROE", "high"], ["ebit_margin", "Margem EBIT", "high"], ["net_debt_ebitda", "Dívida líq. ÷ EBITDA", "low"], ["ni_cagr5", "Crescimento do lucro, 5 anos", "high"], ["rev_cagr5", "Crescimento da receita, 5 anos", "high"], ["ret_12m", "Preço em 12 meses", "high"], ["drawdown", "Queda desde a máxima", "high"]];
function viewCompare() {
  S.cmp = (S.cmp || store.get("cmp", [])).filter((t) => S.byTicker[t]).slice(0, 3);
  const sel = S.cmp.map((t) => S.byTicker[t]), col = (i) => SERIES_COLORS[i];
  const sug = sel.length ? peersOf(sel[0]).filter((p) => !S.cmp.includes(p.ticker)).sort(byScore).slice(0, 6) : inMarket().filter((s) => s.verdict === "oportunidade").sort(byScore).slice(0, 6);
  app.innerHTML = `
    <h1>${sel.length >= 2 ? `${sel.map((s) => esc(s.ticker)).join(" × ")}` : "Compare até três ações."}</h1>
    <p class="lede">Lado a lado: veredito, preço, perfil e cada indicador, com o melhor em destaque. Bom para decidir entre duas empresas do mesmo setor.</p>
    <div class="fbar"><div class="frow"><input type="search" id="cmpq" list="cmplist" placeholder="Digite um código e aperte Enter" aria-label="Adicionar ação à comparação"${sel.length >= 3 ? " disabled" : ""}><datalist id="cmplist">${S.stocks.map((s) => `<option value="${esc(s.ticker)}">${nm(s)}</option>`).join("")}</datalist>
      ${sel.map((s, i) => `<button class="chip" data-cmpdel="${esc(s.ticker)}" aria-label="Remover ${esc(s.ticker)}"><i class="vdot" style="--c:${col(i)}"></i><b style="color:var(--ink)">${esc(s.ticker)}</b> ×</button>`).join("")}
      ${sel.length < 3 && sug.length ? `<span class="flab" style="margin-left:8px">${sel.length ? "Do mesmo setor" : "Sugestões"}</span>${sug.map((s) => `<button class="chip" data-cmpadd="${esc(s.ticker)}">+ ${esc(s.ticker)}</button>`).join("")}` : ""}</div></div>
    ${sel.length >= 2 ? `
    <section class="sec tight"><div class="why" style="grid-template-columns:repeat(${sel.length},minmax(0,1fr))">${sel.map((s, i) => `<article style="border-top-color:${col(i)}"><header><a href="#/acao/${esc(s.ticker)}">${esc(s.ticker)}</a><span class="num">${money(s.price, s.currency)}</span></header><p class="meta">${nm(s)}</p><p style="margin:0 0 10px">${pill(s.verdict)}</p><ul class="sig">${pros(s, 2).map((g) => sigLi(SIGNALS[g[0]], g[2], true)).join("")}${cons(s, 2).map((g) => sigLi(g[0], g[1], false)).join("")}</ul></article>`).join("")}</div></section>
    <section class="sec"><div class="cols"><div><h2>Preço em 3 anos, partindo de 100</h2><p class="sub">Todas começam em 100, então dá para ver quem subiu mais no período.</p><div id="c-cmpp"><p class="note">Carregando preços…</p></div></div>
      <div><h2>Perfil</h2><p class="sub">Contra o setor de cada uma.</p><div id="c-cmpr"></div></div></div></section>
    <section class="sec"><h2>Indicador por indicador</h2><p class="sub">Em negrito e verde, o melhor de cada linha.</p>
      <div class="tablewrap"><table><thead><tr><th class="l">Indicador</th>${sel.map((s, i) => `<th><i class="vdot" style="--c:${col(i)};margin-right:6px"></i>${esc(s.ticker)}</th>`).join("")}</tr></thead>
      <tbody>${CMP_ROWS.map(([k, l, dir]) => { const vs = sel.map((s) => mget(k, s)), ok = vs.filter((v) => v !== null), best = ok.length > 1 && dir ? (dir === "low" ? Math.min(...ok) : Math.max(...ok)) : null; return `<tr style="cursor:default"${GLOSS[k] ? ` data-tip="${esc(GLOSS[k])}"` : ""}><td class="l">${l}</td>${vs.map((v) => `<td class="num"${v !== null && v === best ? ` style="font-weight:600;${shade(0.5)}"` : ""}>${v === null ? "–" : METRICS[k].f(v)}</td>`).join("")}</tr>`; }).join("")}</tbody></table></div></section>` : `<p class="muted" style="padding:36px 0">Escolha pelo menos duas ações. Você também pode clicar em "Comparar" na página de qualquer ação.</p>`}`;
  if (sel.length < 2) return;
  mount("c-cmpr", (w) => radarMulti(sel.map((s, i) => ({ name: s.ticker, color: col(i), dims: s.dims })), w));
  Promise.all(sel.map((s) => getPrices(s.ticker))).then((ps) => {
    if (!document.getElementById("c-cmpp")) return;
    const n = Math.min(156, ...ps.map((p) => ((p && p.w) || []).length)); if (n < 2) { $("#c-cmpp").innerHTML = `<p class="note">Sem histórico de preço para comparar.</p>`; return; }
    const series = sel.map((s, i) => { const pts = ps[i].w.slice(-n), b = pts[0][1]; return { name: s.ticker, color: col(i), pts: pts.map((p) => [p[0], (p[1] / b) * 100]) }; });
    mount("c-cmpp", (w) => lineChart(series, w, { ref: 100, xfmt: (d) => fmtDate(d), xfull: (d) => fmtDate(d, true), named: true, label: "Preço indexado" }));
  });
}
function cmpAdd(t) { t = (t || "").trim().toUpperCase(); if (!S.byTicker[t]) return false; S.cmp = (S.cmp || store.get("cmp", [])).filter((q) => q !== t).concat(t).slice(-3); store.set("cmp", S.cmp); return true; }

// ---------- Minha lista ----------
function viewList() {
  const favs = S.stocks.filter((s) => S.favs.has(s.ticker)).sort(byScore), nt = notes(), c = counts(favs);
  app.innerHTML = `
    <h1>${favs.length ? `${c.oportunidade} de ${favs.length} na sua lista ${c.oportunidade === 1 ? "está barata e boa" : "estão baratas e boas"}.` : "Sua lista está vazia."}</h1>
    <p class="lede">${favs.length ? "As ações que você marcou com a estrela, com o seu preço-alvo e a distância até ele. Tudo fica salvo só neste navegador." : "Clique na estrela ☆ ao lado de qualquer ação para acompanhá-la aqui, com preço-alvo e anotações."}</p>
    ${favs.length ? `<div class="vbar">${vbar(c, favs.length)}</div><div class="vlegend">${VORDER.filter((v) => c[v]).map((v) => `<a>${vdot(v)}<b>${c[v]}</b> ${VERDICTS[v].pl}</a>`).join("")}</div>
    <section class="sec"><div class="tablewrap"><table><thead><tr><th class="l">Ação</th><th class="l">Veredito</th><th>Score</th><th>Preço</th><th>12 meses</th><th>Meu preço-alvo</th><th>Falta para o alvo</th><th class="l">Anotação</th></tr></thead>
      <tbody>${favs.map((s) => { const n = nt[s.ticker] || {}, gap = n.target > 0 ? s.price / n.target - 1 : null; return `<tr data-t="${esc(s.ticker)}"><td class="l">${star(s)} <span class="tk">${esc(s.ticker)}</span><span class="nm">${nm(s)}</span></td><td class="l">${pill(s.verdict)}</td><td class="num">${x(s.final_score, 0)}</td><td class="num">${money(s.price, s.currency)}</td><td class="num ${s.ret_12m >= 0 ? "up" : "down"}">${spct(s.ret_12m)}</td>
        <td class="num">${n.target > 0 ? money(n.target, s.currency) : `<span class="muted">definir</span>`}</td><td class="num">${gap === null ? "–" : gap <= 0 ? `<b class="up">No alvo</b>` : `cair ${pct(gap / (1 + gap), 0)}`}</td><td class="l"><span class="nm" style="max-width:260px">${esc(n.note || "")}</span></td></tr>`; }).join("")}</tbody></table></div>
      <p class="note">Defina o preço-alvo e as anotações na aba "Minhas notas" de cada ação.</p></section>
    ${favs.length >= 2 ? `<section class="sec"><h2>Sua lista no mapa</h2><p class="sub">Valor na horizontal, qualidade na vertical.</p><div id="c-favs"></div></section>` : ""}` : `<p style="margin-top:28px"><a class="btn" href="#/" style="text-decoration:none">Ver as baratas e boas de hoje</a></p>`}`;
  if (favs.length >= 2) mount("c-favs", (w) => scatter(favs, w, { x: "value_score", y: "quality_score", quad: QUAD, labels: 30, h: Math.round(Math.min(460, Math.max(300, w * 0.42))) }));
}

// ---------- Ação ----------
const G_TESTS = [
  ["Porte", "Está no terço maior do mercado em valor"], ["Balanço forte", "Liquidez corrente de 2 ou mais e dívida longa menor que o capital de giro"],
  ["Lucro estável", "Nenhum prejuízo nos últimos 10 anos"], ["Dividendos", "Pagou dividendo em todos os anos do histórico"],
  ["Crescimento", "Lucro médio de 3 anos pelo menos um terço maior que 10 anos antes"], ["P/L moderado", "Preço até 15 vezes o lucro médio de 3 anos"],
  ["P/VP moderado", "P/VP até 1,5, ou P/L × P/VP até 22,5"],
];
const MY_CHECKS = ["Entendo como a empresa ganha dinheiro", "Li o último resultado trimestral", "Sei por que o mercado a deixou barata", "A dívida cabe na geração de caixa", "Aguentaria ver a ação cair 30% sem vender", "Não vai passar de uma fatia pequena da minha carteira"];
const STABS = [["resumo", "Resumo"], ["valor", "Valor justo"], ["preco", "Preço e risco"], ["negocio", "Negócio"], ["dividendos", "Dividendos"], ["setor", "Contra o setor"], ["notas", "Minhas notas"]];
function thesis(s) {
  const p = pros(s, 2).map((g) => g[2]).filter(Boolean), c = cons(s, 2);
  const open = { oportunidade: "Está barata e a empresa é boa", barata_risco: "Parece barata, mas tem risco", boa_cara: "A empresa é boa, mas o preço já reflete isso", neutra: "Nada chama atenção: nem barata, nem especialmente boa", evitar: "Os números pedem distância" }[s.verdict];
  return `${open}.${p.length ? ` A favor: ${esc(p.join("; "))}.` : ""}${c.length ? ` Contra: ${esc(c.map((q) => q[0].toLowerCase()).join(" e "))}.` : ""}`;
}
function fairRows(s) {
  const peers = peersOf(s), mpe = median(peers.map((p) => (p.pe > 0 ? p.pe : null))), mpb = median(peers.map((p) => (p.pb > 0 ? p.pb : null)));
  return [
    { label: "Número de Graham", v: s.graham_value, hint: "Raiz de 22,5 × lucro por ação × patrimônio por ação" },
    { label: "15× o lucro médio de 3 anos", v: s.pe_avg3 > 0 ? (s.price * 15) / s.pe_avg3 : null, hint: "O teto de P/L de Graham para o investidor defensivo" },
    { label: "P/L mediano do setor", v: s.eps > 0 && mpe ? s.eps * mpe : null, hint: `Lucro por ação × ${x(mpe)}, o P/L típico do setor` },
    { label: "P/VP mediano do setor", v: s.bvps > 0 && mpb ? s.bvps * mpb : null, hint: `Patrimônio por ação × ${x(mpb, 2)}, o P/VP típico do setor` },
    { label: "Teto de Bazin", v: s.bazin_price, hint: "Dividendo por ação ÷ 6%" },
  ];
}
function viewStock(tk, tab) {
  const s = S.byTicker[tk];
  if (!s) { app.innerHTML = `<h1>Ação não encontrada.</h1><p class="lede">O código ${esc(tk)} não está na base. <a href="#/explorar">Buscar outra ação</a></p>`; return; }
  if (!STABS.some((t) => t[0] === tab)) tab = "resumo";
  const cur = s.currency, fin = s.is_financial, ser = S.series[s.ticker] || [], peers = peersOf(s), r = rf(s.market), base = `#/acao/${encodeURIComponent(s.ticker)}`;
  const head = `<a class="back" href="#/explorar">← Todas as ações</a>
    <div class="shead"><div><h1>${esc(s.ticker)} ${star(s)}</h1><div class="co">${esc(s.name !== s.ticker ? s.name + ", " : "")}${esc(s.sector || "")}${s.market === "BR" ? ", Brasil" : ", EUA"}</div></div>
      <div style="text-align:right"><div class="px num">${money(s.price, cur)}</div><div class="${s.ret_12m >= 0 ? "up" : "down"}" style="font-size:13.5px">${spct(s.ret_12m)} em 12 meses</div></div></div>
    <div class="sactions">${pill(s.verdict, true)}<button class="btn" data-cmpgo="${esc(s.ticker)}">Comparar com outra</button></div>
    <nav class="tabs" aria-label="Seções da ação">${STABS.map(([k, l]) => `<a href="${base}/${k}" class="${k === tab ? "on" : ""}">${l}</a>`).join("")}</nav>`;
  const kv = (items) => `<div class="kv">${items.map(([k, v, h]) => `<div><div class="k">${k}</div><div class="v num">${v}</div><div class="h">${h || ""}</div></div>`).join("")}</div>`;
  let body = "", after = () => {};

  if (tab === "resumo") {
    const flags = (s.flags || []).filter((f) => FLAGS[f]).sort((a, b) => FLAGS[b][2] - FLAGS[a][2]);
    body = `<p class="thesis">${thesis(s)}</p>
      ${kv([["Score final", x(s.final_score, 0), "de 100, contra o setor"], ["Valor", x(s.value_score, 0), `mais barata que ${x(s.value_score, 0)}% do setor`], ["Qualidade", x(s.quality_score, 0), `melhor que ${x(s.quality_score, 0)}% do setor`], ["Sinais a favor", `${s.sig_ok} de ${s.sig_total}`, `${big(s.market_cap, cur)} de valor de mercado`]])}
      <section class="sec"><div class="cols"><div><h2>Os motivos</h2><p class="sub">Dez perguntas que os livros de valor fazem a qualquer ação, com a resposta e o número.</p>
        <ul class="sig">${(s.signals || []).map((g) => sigLi(sigName(g), g[1] === null ? "sem dado ou não se aplica" : g[2], g[1])).join("")}</ul></div>
        <div><h2>Perfil</h2><p class="sub">Contra o setor. 50 é a mediana.</p><div id="c-radar"></div></div></div></section>
      <section class="sec"><div class="cols even"><div><h2>Alertas</h2>${flags.length ? `<ul class="flags">${flags.map((f) => `<li>${FLAGS[f][2] ? `<span class="mk no" style="display:inline-grid;vertical-align:-3px;margin-right:8px">!</span>` : ""}<b>${FLAGS[f][0]}.</b> <span class="muted">${FLAGS[f][1]}</span></li>`).join("")}</ul>` : `<p class="sub">Nenhum alerta nos dados disponíveis.</p>`}</div>
        <div><h2>Evolução do score</h2><p class="sub">O score dia a dia desde que o site começou a guardar o histórico.</p><div id="c-score"></div></div></div></section>`;
    after = () => { mount("c-radar", (w) => radar(s.dims, w)); const h = S.hist[s.ticker] || []; mount("c-score", (w) => (h.length > 1 ? lineChart([{ name: "Score", color: "var(--ink)", pts: h.map((q) => [q[0], q[1]]) }], w, { h: 200, xfmt: (d) => fmtDate(d, true).slice(0, 5), xfull: (d) => fmtDate(d, true), fmt: (v) => x(v, 1) }) : `<p class="note">Ainda sem histórico suficiente.</p>`)); };
  }

  if (tab === "valor") {
    const rows = fairRows(s), vals = rows.map((q) => q.v).filter((v) => isNum(v) && v > 0), mid = median(vals), up = mid ? mid / s.price - 1 : null, above = vals.filter((v) => v > s.price).length;
    const cs = s.graham_checks || [], ey = s.pe > 0 ? 1 / s.pe : null;
    body = `<p class="thesis">${vals.length ? `${above} de ${vals.length} réguas de valor ficam acima do preço de hoje. A mediana delas é ${money(mid, cur)}, ${up >= 0 ? `${pct(up, 0)} acima do preço: há margem de segurança` : `${pct(-up, 0)} abaixo do preço: não há margem de segurança`}.` : "Faltam dados para estimar referências de valor desta ação."}</p>
      <section class="sec tight"><h2>Réguas de valor</h2><p class="sub">Cinco formas simples de estimar quanto a ação poderia valer. Barra verde = referência acima do preço. Nenhuma é preço-alvo: servem para ver se o preço está folgado ou esticado.</p><div id="c-fair"></div></section>
      <section class="sec">${kv([["Margem de segurança", vals.length ? spct(up) : "–", "mediana das réguas contra o preço"], ["Lucro sobre o preço", pct(ey), isNum(r) && isNum(ey) ? `${METRICS.ey_gap.f(s.ey_gap)} contra a ${s.market === "US" ? "Treasury" : "Selic"} de ${pct(r, 2)}` : "1 ÷ P/L"], ["Crescimento embutido no preço", s.pe > 0 ? spct(s.implied_g, 1) + " a.a." : "–", isNum(s.ni_cagr5) ? `o lucro cresceu ${spct(s.ni_cagr5, 1)} a.a. em 5 anos` : "pela fórmula de Graham: (P/L − 8,5) ÷ 2"], ["Anos para o lucro pagar o preço", s.pe > 0 ? x(s.pe) : "–", "é o próprio P/L"]])}
        <p class="note">Crescimento embutido: Graham estimava que uma empresa sem crescimento vale 8,5 vezes o lucro e que cada ponto de crescimento anual soma 2 ao P/L. Se o preço embute mais crescimento do que a empresa já entregou, o preço está otimista.</p></section>
      <section class="sec"><div class="cols even"><div><h2>Onde o preço está</h2><p class="sub">Contra a faixa de 52 semanas e as réguas clássicas.</p><div id="c-ruler"></div></div>
        <div><h2>Checklist de Graham</h2>${cs.length ? `<p class="sub">Passa em ${s.graham_score} de ${s.graham_total} testes do investidor defensivo com dado disponível.</p><ul class="sig">${G_TESTS.map(([t, d], i) => sigLi(t, d, cs[i] === "ok" ? true : cs[i] === "fail" ? false : null)).join("")}</ul>` : `<p class="sub">Sem dados suficientes.</p>`}</div></div></section>
      <section class="sec"><h2>O P/L desta ação no mercado</h2><p class="sub">Onde o P/L dela cai entre todas as ações do mesmo país.</p><div id="c-pedist"></div></section>`;
    after = () => {
      mount("c-fair", (w) => fairChart(rows, s.price, w, cur));
      mount("c-ruler", (w) => ruler([{ v: s.lo_52w, label: "Mínima de 52 semanas" }, { v: s.hi_52w, label: "Máxima de 52 semanas" }, { v: s.price, label: "Preço hoje", strong: true }, { v: s.graham_value, label: "Número de Graham" }, { v: s.bazin_price, label: "Teto de Bazin" }], w, cur));
      mount("c-pedist", (w) => (s.pe > 0 ? histogram(S.stocks.filter((q) => q.market === s.market), w, "pe", { lo: 0, hi: 40, step: 2, mark: s.pe, markLabel: `${s.ticker}: ${x(s.pe)}` }) : `<p class="note">Sem lucro nos últimos 12 meses: o P/L não se aplica.</p>`));
    };
  }

  if (tab === "preco") {
    body = `<section class="sec tight"><h2>Histórico de preço</h2><p class="sub">Passe o mouse para ver o preço em cada data. A linha cinza é a média móvel: preço acima dela indica tendência de alta.</p><div id="pricebox"></div></section>
      <section class="sec"><h2>Retorno e risco</h2><p class="sub">Quanto rendeu em cada janela e quanto balança. Volatilidade alta pede estômago e uma fatia menor da carteira.</p><div id="c-risk"><p class="note">Carregando…</p></div></section>
      <section class="sec"><h2>Quedas desde o topo</h2><p class="sub">A cada semana, quanto o preço estava abaixo do maior valor já atingido até ali. Mostra o tamanho e a duração das quedas em 10 anos.</p><div id="c-under"></div></section>`;
    after = () => {
      priceCard(s);
      getPrices(s.ticker).then((p) => {
        const el = document.getElementById("c-risk"); if (!el) return;
        if (!p || !(p.d || []).length) { el.innerHTML = `<p class="note">Sem histórico de preço para esta ação.</p>`; return; }
        const d = p.d, wk = p.w || [], rets = []; for (let i = 1; i < d.length; i++) if (d[i][1] > 0 && d[i - 1][1] > 0) rets.push(Math.log(d[i][1] / d[i - 1][1]));
        const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1), vol = rets.length > 20 ? Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1)) * Math.sqrt(252) : null;
        let peak = -Infinity, mdd = 0; const under = wk.map((q) => { peak = Math.max(peak, q[1]); const dd = q[1] / peak - 1; mdd = Math.min(mdd, dd); return [q[0], dd]; });
        const per = [["1 mês", d, 21, 0], ["6 meses", d, 126, 0], ["1 ano", d, 252, 1], ["3 anos", wk, 156, 3], ["5 anos", wk, 260, 5], ["10 anos", wk, 520, 10]].map(([l, a, n, y]) => { if (a.length <= n * 0.97) return [l, null, null]; const st = a[Math.max(0, a.length - 1 - n)][1], tot = a[a.length - 1][1] / st - 1; return [l, tot, y > 1 ? Math.pow(1 + tot, 1 / y) - 1 : null]; });
        el.innerHTML = `<div class="kv">${[["Volatilidade anual", pct(vol, 0), vol === null ? "" : vol > 0.45 ? "alta: oscila muito" : vol > 0.28 ? "média" : "baixa para uma ação"], ["Maior queda em 10 anos", pct(mdd, 0), "do topo ao fundo"], ["Queda desde a máxima de 52 semanas", pct(s.drawdown, 0), `máxima de ${money(s.hi_52w, cur)}`], ["Contra a média de 200 dias", spct(s.vs_ma200), s.vs_ma200 >= 0 ? "tendência de alta" : "tendência de baixa"]].map(([k, v, h]) => `<div><div class="k">${k}</div><div class="v num">${v}</div><div class="h">${h}</div></div>`).join("")}</div>
          <div class="tablewrap" style="margin-top:28px"><table><thead><tr><th class="l">Janela</th>${per.map((q) => `<th>${q[0]}</th>`).join("")}</tr></thead><tbody>
          <tr style="cursor:default"><td class="l">Retorno total</td>${per.map((q) => `<td class="num ${q[1] >= 0 ? "up" : q[1] < 0 ? "down" : ""}">${spct(q[1])}</td>`).join("")}</tr>
          <tr style="cursor:default"><td class="l">Ao ano</td>${per.map((q) => `<td class="num">${q[2] === null ? "–" : spct(q[2], 1)}</td>`).join("")}</tr></tbody></table></div>
          <p class="note">Preço ajustado por dividendos, então o retorno já inclui os dividendos reinvestidos.</p>`;
        mount("c-under", (w) => lineChart([{ name: "Queda", color: "var(--v-barata_risco)", pts: under }], w, { area: true, h: 200, ref: 0, fmt: (v) => pct(v, 0), xfmt: (q) => fmtDate(q), xfull: (q) => fmtDate(q, true), label: "Quedas desde o topo" }));
      });
    };
  }

  if (tab === "negocio") {
    const minis = [["Lucro líquido", ser.map((q) => [q[0], q[1]]), (v) => big(v, cur)], ["Receita", ser.map((q) => [q[0], q[2]]), (v) => big(v, cur)], ["Margem EBIT", ser.map((q) => [q[0], isNum(q[3]) && q[2] > 0 ? q[3] / q[2] : null]), (v) => pct(v)], ["Dividendos pagos", ser.map((q) => [q[0], q[4]]), (v) => big(v, cur)]];
    const giro = s.roa && s.net_margin ? s.roa / s.net_margin : null, alav = s.roe && s.roa ? s.roe / s.roa : null;
    body = `<section class="sec tight">${kv([["Crescimento do lucro", spct(s.ni_cagr5, 1), "ao ano, em 5 anos"], ["Crescimento da receita", spct(s.rev_cagr5, 1), "ao ano, em 5 anos"], [fin ? "ROE" : "ROIC", pct(ret(s), 1), `custo de capital perto de ${s.market === "US" ? "8%" : "13%"}`], ["Lucro que vira caixa", isNum(s.cfo_ni_3) ? x(s.cfo_ni_3, 2) + "×" : "–", "caixa da operação ÷ lucro, 3 anos"]])}</section>
      <section class="sec"><h2>Histórico do negócio</h2><p class="sub">Até 12 anos de balanços anuais. Lucro estável e crescente vale mais que um ano bom.</p>
        ${ser.length >= 2 ? `<div class="minis">${minis.map(([t, rows, fmt]) => { const pts = rows.filter((q) => isNum(q[1])); return `<div><h3>${t}</h3><div class="last">${pts.length ? fmt(pts[pts.length - 1][1]) : "–"}</div><div id="m-${t.replace(/\W/g, "")}"></div></div>`; }).join("")}</div>` : `<p class="note">Ainda sem histórico de balanços para esta ação.</p>`}</section>
      <section class="sec"><h2>O preço acompanhou o lucro?</h2><p class="sub">Preço e lucro líquido partindo de 100 no mesmo ano. Se o preço subiu muito mais que o lucro, a ação ficou mais cara; se subiu menos, ficou mais barata.</p><div id="c-pl"><p class="note">Carregando…</p></div>
        <div class="vlegend"><a><i class="vdot" style="--c:var(--s1)"></i>Preço</a><a><i class="vdot" style="--c:var(--s2)"></i>Lucro líquido</a></div></section>
      <section class="sec"><h2>De onde vem o retorno (DuPont)</h2><p class="sub">O ROE é o produto de três coisas. Retorno que vem de margem e giro é saudável; retorno que vem só de alavancagem é frágil.</p>
        ${kv([["Margem líquida", pct(s.net_margin, 1), "lucro ÷ receita"], ["× Giro do ativo", isNum(giro) ? x(giro, 2) + "×" : "–", "receita ÷ ativo"], ["× Alavancagem", isNum(alav) ? x(alav, 2) + "×" : "–", isNum(alav) && alav > 4 && !fin ? "alta: o retorno depende de dívida" : "ativo ÷ patrimônio"], ["= ROE", pct(s.roe, 1), "lucro ÷ patrimônio"]])}</section>`;
    after = () => {
      if (ser.length >= 2) minis.forEach(([t, rows, fmt]) => mount("m-" + t.replace(/\W/g, ""), (w) => miniBars(rows, w, fmt)));
      getPrices(s.ticker).then((p) => {
        if (!document.getElementById("c-pl")) return;
        const yp = {}; for (const q of (p && p.w) || []) yp[+q[0].slice(0, 4)] = q[1];
        const rows = ser.filter((q) => isNum(q[1]) && isNum(yp[q[0]])), typ = median(rows.map((q) => (q[1] > 0 ? q[1] : null))), i0 = rows.findIndex((q) => q[1] >= 0.5 * typ), use = i0 >= 0 ? rows.slice(i0) : [];
        mount("c-pl", (w) => (use.length >= 3 ? lineChart([{ name: "Preço", color: "var(--s1)", pts: use.map((q) => [q[0], (yp[q[0]] / yp[use[0][0]]) * 100]) }, { name: "Lucro líquido", color: "var(--s2)", pts: use.map((q) => [q[0], (q[1] / use[0][1]) * 100]) }], w, { ref: 100, named: true, h: 260, label: "Preço e lucro indexados" }) : `<p class="note">Sem anos suficientes de lucro e preço para comparar.</p>`));
      });
    };
  }

  if (tab === "dividendos") {
    const dsig = sigOf(s, "dividendos"), gap = s.bazin_price > 0 ? s.bazin_price / s.price - 1 : null;
    body = `<p class="thesis">${s.dy > 0 ? `Paga ${pct(s.dy)} ao ano sobre o preço de hoje${isNum(r) ? `, contra ${pct(r, 2)} da ${s.market === "US" ? "Treasury" : "Selic"}` : ""}. ${isNum(s.payout) ? (s.payout > 1 ? "Distribui mais do que lucra: esse nível não se sustenta." : `Distribui ${pct(s.payout, 0)} do lucro${s.payout < 0.7 ? ", com folga para manter" : ""}.`) : ""}` : "Esta ação não pagou dividendos nos últimos 12 meses."}</p>
      ${kv([["Dividend yield", pct(s.dy), dsig && dsig[1] === true ? "consistente" : dsig && dsig[1] === false ? "fraco ou irregular" : ""], ["Payout", pct(s.payout, 0), "parte do lucro distribuída"], ["Anos pagando", isNum(s.div_years) && s.hist_years ? `${s.div_years} de ${s.hist_years}` : "–", "no histórico de balanços"], ["Teto de Bazin", money(s.bazin_price, cur), gap === null ? "" : gap >= 0 ? `preço ${pct(gap / (1 + gap), 0)} abaixo do teto` : `preço ${pct(-gap, 0)} acima do teto`]])}
      <section class="sec"><div class="cols even"><div><h2>Dividendos pagos por ano</h2><p class="sub">Total distribuído pela empresa em cada ano.</p><div id="c-divh"></div></div>
        <div><h2>Simulador</h2><p class="sub">Quanto você receberia por ano se o dividendo dos últimos 12 meses se repetisse.</p>
          <div class="controls"><label>Valor investido (${cur === "USD" ? "US$" : "R$"}) <input type="number" id="simv" min="0" step="1000" value="${store.get("simv", 10000)}" inputmode="numeric"></label></div><div id="simout"></div></div></div></section>`;
    after = () => { mount("c-divh", (w) => miniBars(ser.map((q) => [q[0], q[4]]), w, (v) => big(v, cur))); drawSim(s); };
  }

  if (tab === "setor") {
    const tracks = [["pe", "P/L", "low"], ["pb", "P/VP", "low"], !fin && ["ev_ebit", "EV/EBIT", "low"], ["dy", "Dividend yield", "high"], [fin ? "roe" : "roic", fin ? "ROE" : "ROIC", "high"], !fin && ["ebit_margin", "Margem EBIT", "high"], !fin && ["net_debt_ebitda", "Dívida líq. ÷ EBITDA", "low"], ["ni_cagr5", "Crescimento do lucro, 5 anos", "high"], ["ret_12m", "Preço em 12 meses", "high"]].filter(Boolean)
      .map(([k, l, dir]) => { const v = mget(k, s), p = pctRank(s, k, dir), md = median(peers.map((q) => mget(k, q))); return v === null || p === null ? "" : `<div class="trk"><span>${l}</span><span class="v">${METRICS[k].f(v)}</span><span class="t" data-tip="<b>${l}: ${METRICS[k].f(v)}</b><br>Melhor que ${x(p, 0)}% do setor<br><span class='m'>Mediana do setor: ${METRICS[k].f(md)}</span>"><i class="${p >= 60 ? "good" : p <= 40 ? "bad" : ""}" style="left:${Math.max(2, Math.min(98, p))}%"></i></span><span class="m">mediana ${METRICS[k].f(md)}</span></div>`; }).join("");
    const near = peers.filter((p) => p.ticker !== s.ticker).sort(byScore).slice(0, 8), pos = peers.slice().sort(byScore).findIndex((p) => p.ticker === s.ticker) + 1;
    body = `<p class="thesis">É a ${pos}ª de ${peers.length} empresas comparáveis pelo score.</p>
      <section class="sec tight"><div class="cols even"><div><h2>Indicador por indicador</h2><p class="sub">A bolinha mostra a posição entre ${peers.length} empresas. À direita é sempre melhor.</p>
        <div class="trkhead"><span>pior que o setor</span><span>melhor que o setor</span></div>${tracks || `<p class="note">Sem dados para comparar.</p>`}</div>
        <div><h2>No mapa do setor</h2><p class="sub">Valor na horizontal, qualidade na vertical.</p><div id="c-peers"></div></div></div></section>
      <section class="sec"><h2>As concorrentes mais bem colocadas</h2><p class="sub">Clique em "Comparar" para ver as duas lado a lado.</p>
        <div class="tablewrap"><table><thead><tr><th class="l">Ação</th><th class="l">Veredito</th><th>Score</th><th>P/L</th><th>DY</th><th>ROIC/ROE</th><th>12 meses</th><th></th></tr></thead>
        <tbody>${[s].concat(near).map((p) => `<tr data-t="${esc(p.ticker)}"${p === s ? ` style="background:var(--wash)"` : ""}><td class="l"><span class="tk">${esc(p.ticker)}</span><span class="nm">${nm(p)}</span></td><td class="l">${pill(p.verdict)}</td><td class="num">${x(p.final_score, 0)}</td><td class="num">${p.pe > 0 ? x(p.pe) : "–"}</td><td class="num">${pct(p.dy)}</td><td class="num">${pct(ret(p), 0)}</td><td class="num ${p.ret_12m >= 0 ? "up" : "down"}">${spct(p.ret_12m)}</td><td>${p === s ? "" : `<button class="linkbtn" data-cmppair="${esc(s.ticker)},${esc(p.ticker)}">Comparar</button>`}</td></tr>`).join("")}</tbody></table></div></section>`;
    after = () => mount("c-peers", (w) => scatter(peers, w, { x: "value_score", y: "quality_score", quad: QUAD, hl: s.ticker, h: Math.round(Math.min(380, Math.max(280, w * 0.7))) }));
  }

  if (tab === "notas") {
    const n = notes()[s.ticker] || {}, gap = n.target > 0 ? s.price / n.target - 1 : null, ck = n.checks || [];
    body = `<p class="thesis">Seu espaço para decidir com calma. Fica salvo só neste navegador.</p>
      <section class="sec tight"><div class="cols even"><div><h2>Meu preço-alvo de compra</h2><p class="sub">O preço em que você compraria. A ação aparece na sua lista com a distância até ele.</p>
        <div class="controls"><label>Preço-alvo (${cur === "USD" ? "US$" : "R$"}) <input type="number" id="ntarget" min="0" step="0.01" value="${n.target || ""}" inputmode="decimal" data-nt="${esc(s.ticker)}"></label></div>
        <p id="ntout" class="sub">${gap === null ? "Sem alvo definido." : gap <= 0 ? `O preço de hoje (${money(s.price, cur)}) já está no seu alvo.` : `O preço precisa cair ${pct(gap / (1 + gap), 0)} para chegar ao seu alvo.`}</p>
        <h2 style="margin-top:36px">Anotações</h2><textarea id="nnote" rows="6" placeholder="Por que esta ação? O que faria você mudar de ideia?" data-nt="${esc(s.ticker)}">${esc(n.note || "")}</textarea></div>
        <div><h2>Antes de comprar</h2><p class="sub">Os números não dizem tudo. Marque o que você já conferiu.</p>
          <ul class="checks">${MY_CHECKS.map((c, i) => `<li><label><input type="checkbox" data-nck="${i}" data-nt="${esc(s.ticker)}"${ck.includes(i) ? " checked" : ""}> ${c}</label></li>`).join("")}</ul>
          <p class="note">${S.favs.has(s.ticker) ? "Esta ação está na sua lista." : "Clique na estrela ao lado do código para colocar esta ação na sua lista."}</p></div></div></section>`;
  }
  app.innerHTML = head + body; after();
}
function drawSim(s) {
  const el = $("#simout"), inp = $("#simv"); if (!el || !inp) return;
  const v = Math.max(0, +inp.value || 0), cur = s.currency, sh = s.price > 0 ? Math.floor(v / s.price) : 0, yr = sh * (s.dps || 0), r = rf(s.market);
  el.innerHTML = `<div class="kv two"><div><div class="k">Ações compradas</div><div class="v num">${NF[0].format(sh)}</div><div class="h">a ${money(s.price, cur)} cada</div></div><div><div class="k">Dividendos por ano</div><div class="v num">${money(yr, cur)}</div><div class="h">${money(yr / 12, cur)} por mês, em média</div></div></div>
    <p class="note">${isNum(r) ? `O mesmo valor na ${s.market === "US" ? "Treasury de 10 anos" : "Selic"} renderia cerca de ${money(v * r, cur)} por ano, antes de impostos. ` : ""}Dividendos passados não garantem dividendos futuros.</p>`;
}

// ---------- Método ----------
function viewMethod() {
  const m = S.meta.macro || {}, src = S.meta.sources || {};
  app.innerHTML = `<div class="prose">
    <h1>Como o veredito é calculado.</h1>
    <p class="lede">Barato sozinho não basta. A regra dos livros de valor é: preço baixo, empresa que rende mais que o custo do capital, balanço que aguenta e lucro que se repete. O site mede cada parte e junta tudo em uma frase.</p>
    <h2>Os cinco vereditos</h2>
    <ul>${VORDER.map((v) => `<li>${vdot(v)} <b style="color:var(--ink)">${VERDICTS[v].l}.</b> ${VERDICTS[v].d}</li>`).join("")}</ul>
    <h2>Valor e qualidade</h2>
    <p><b style="color:var(--ink)">Valor</b> (0 a 100) compara os múltiplos da ação com os do mesmo setor: EV/EBIT, P/VP, EV/EBITDA, P/L, P/L no lucro médio de 3 anos, dividend yield, P/FCF e P/Receita. Para bancos e seguradoras valem P/VP, P/L e dividendos. <b style="color:var(--ink)">Qualidade</b> (0 a 100) faz o mesmo com ROIC, dívida, estabilidade do lucro, cobertura de juros, crescimento, margens e conversão de lucro em caixa. O score final é 60% valor e 40% qualidade, menos descontos por alerta.</p>
    <h2>Os dez sinais</h2>
    <ul>${Object.values(SIGNALS).map((l) => `<li>${l}</li>`).join("")}</ul>
    <p>Para ser "barata e boa" a ação precisa de valor 60 ou mais, qualidade 55 ou mais, nenhum alerta grave (prejuízo, patrimônio negativo, dívida alta, juros pesados, pico de ciclo), retorno acima do custo de capital e pelo menos 60% dos sinais a favor. A tendência do preço é só contexto: não entra na nota de valor.</p>
    <h2>Glossário</h2>
    <ul>${[["P/L", GLOSS.pe], ["P/VP", GLOSS.pb], ["EV/EBIT", GLOSS.ev_ebit], ["Dividend yield", GLOSS.dy], ["Payout", GLOSS.payout], ["ROIC e ROE", GLOSS.ret], ["Dívida líquida ÷ EBITDA", GLOSS.net_debt_ebitda], ["Cobertura de juros", GLOSS.coverage], ["Número de Graham", "Raiz de 22,5 × lucro por ação × patrimônio por ação. Um teto de preço para quem quer pagar pouco por lucro e patrimônio."], ["Teto de Bazin", "Dividendo por ação ÷ 6%. O preço máximo para receber 6% ao ano em dividendos."], ["Margem de segurança", "A distância entre o preço e o que a ação parece valer. Quanto maior, menos você depende de acertar a previsão."], ["Volatilidade", "O quanto o preço balança em um ano. Não é o mesmo que risco de perder dinheiro, mas pesa no sono."]].map(([t, d]) => `<li><b style="color:var(--ink)">${t}.</b> ${d}</li>`).join("")}</ul>
    <h2>Referências usadas hoje</h2>
    <p>Selic ${pct(m.selic, 2)}, IPCA em 12 meses ${pct(m.ipca_12m, 2)}, Treasury de 10 anos ${pct(m.us10y, 2)}. Custo de capital de referência: 13% no Brasil e 8% nos EUA.</p>
    <h2>De onde vêm os dados</h2>
    <ul><li>Brasil: ${esc(src.BR || "Fundamentus")}</li><li>EUA: ${esc(src.US || "Yahoo Finance")}</li><li>Histórico de balanços: ${esc(src.history || "CVM e SEC")}</li><li>Juros e inflação: ${esc(src.macro || "Banco Central")}</li></ul>
    <p>Tudo é coletado uma vez por dia útil, depois do fechamento.</p>
    <h2>Limites</h2>
    <ul><li>O site aponta candidatas. Não é recomendação de compra: leia o balanço e entenda o negócio antes.</li><li>Dados gratuitos têm erros e atrasos. Um zero pode ser dado faltando.</li><li>Múltiplos olham o passado. Uma ação pode estar barata porque o lucro vai cair.</li><li>As réguas de valor justo são contas simples, não uma avaliação completa da empresa.</li><li>O custo de capital é um número único por país, o que é duro com setores de retorno naturalmente baixo.</li></ul>
    <h2>Livros por trás das regras</h2>
    <p>O Investidor Inteligente e Security Analysis (Graham), The Little Book That Beats the Market (Greenblatt), Valuation (McKinsey), Faça Fortuna com Ações (Bazin).</p></div>`;
}

// ---------- router and events ----------
const ROUTES = { hoje: viewHome, mapa: viewMap, rankings: viewRanks, dividendos: viewDiv, setores: viewSectors, explorar: viewExplore, comparar: viewCompare, lista: viewList, metodo: viewMethod };
function route() {
  if (!alive()) return;
  mounts = []; hideTip();
  const parts = location.hash.replace(/^#\/?/, "").split("/"), page = parts[0] || "hoje";
  document.querySelectorAll("#stk-nav a").forEach((a) => a.classList.toggle("on", a.dataset.tab === (page === "acao" ? "explorar" : page)));
  document.querySelectorAll("#stk-mkt button").forEach((b) => { b.classList.toggle("on", b.dataset.mkt === S.market); b.setAttribute("aria-pressed", b.dataset.mkt === S.market); });
  if (!S.stocks.length) { app.innerHTML = `<h1>Os dados não carregaram.</h1><p class="lede">Recarregue a página em alguns minutos. Se continuar, a coleta diária pode ter falhado.</p>`; return; }
  if (page === "acao") viewStock(decodeURIComponent(parts[1] || ""), parts[2]); else (ROUTES[page] || viewHome)();
}
let lastPage = null;
window.addEventListener("hashchange", () => { if (!alive()) return; const key = location.hash.split("/").slice(0, 3).join("/"); route(); if (key !== lastPage) window.scrollTo(0, 0); lastPage = key; });
const refilter = () => { saveF(); S.ex.shown = 60; route(); };
const setNote = (tk, patch) => { const all = notes(); all[tk] = Object.assign({}, all[tk], patch); store.set("notes", all); };

document.addEventListener("click", (ev) => {
  if (!alive() || !ev.target.closest(".stocks")) return;
  const t = (sel) => ev.target.closest(sel);
  let el;
  if ((el = t("[data-star]"))) {
    ev.preventDefault(); ev.stopPropagation(); const k = el.dataset.star;
    S.favs.has(k) ? S.favs.delete(k) : S.favs.add(k); store.set("favs", [...S.favs]);
    el.classList.toggle("on", S.favs.has(k)); el.textContent = S.favs.has(k) ? "★" : "☆";
    if (S.f.favs || location.hash.startsWith("#/lista")) route(); return;
  }
  if ((el = t("[data-mkt]"))) { S.market = el.dataset.mkt; store.set("market", S.market); S.ex.shown = 60; route(); return; }
  if (t("[data-fopen]")) { S.fopen = !S.fopen; route(); return; }
  if (t("[data-fclear]")) { S.f = F0(); refilter(); return; }
  if ((el = t("[data-fv]"))) { const v = el.dataset.fv, a = S.f.verdicts; S.f.verdicts = a.includes(v) ? a.filter((q) => q !== v) : a.concat(v); refilter(); return; }
  if ((el = t("[data-fsize]"))) { S.f.size = el.dataset.fsize; refilter(); return; }
  if ((el = t("[data-ft]"))) { S.f[el.dataset.ft] = !S.f[el.dataset.ft]; refilter(); return; }
  if ((el = t("[data-vf]"))) { ev.preventDefault(); S.f.verdicts = [el.dataset.vf]; S.ex.preset = ""; saveF(); S.ex.shown = 60; go("#/explorar"); return; }
  if ((el = t("[data-cmppair]"))) { ev.stopPropagation(); S.cmp = el.dataset.cmppair.split(","); store.set("cmp", S.cmp); go("#/comparar"); return; }
  if ((el = t("[data-cmpgo]"))) { cmpAdd(el.dataset.cmpgo); go("#/comparar"); return; }
  if ((el = t("[data-cmpadd]"))) { cmpAdd(el.dataset.cmpadd); route(); return; }
  if ((el = t("[data-cmpdel]"))) { S.cmp = S.cmp.filter((q) => q !== el.dataset.cmpdel); store.set("cmp", S.cmp); route(); return; }
  if ((el = t("[data-mp]"))) { const p = MAP_PRESETS[el.dataset.mp]; Object.assign(S.map, { preset: el.dataset.mp, x: p[1], y: p[2] }); route(); return; }
  if ((el = t("[data-set]"))) { S.ex.set = el.dataset.set; if (!exCols().includes(S.ex.sort[0])) S.ex.sort = ["final_score", -1]; route(); return; }
  if (t("[data-csv]")) { const cols = exCols(); downloadCsv(`acoes-baratas-${S.meta.date || "hoje"}.csv`, [["Código", "Nome", "Setor", "Veredito"].concat(cols.slice(2).map((k) => COL[k][0]))].concat(exList().map((s) => [s.ticker, s.name, s.sector, VERDICTS[s.verdict].l].concat(cols.slice(2).map((k) => COL[k][2](s)))))); return; }
  if ((el = t("[data-preset]"))) { S.ex.preset = S.ex.preset === el.dataset.preset ? "" : el.dataset.preset; S.ex.shown = 60; route(); return; }
  if ((el = t("th[data-sort]"))) { const k = el.dataset.sort; S.ex.sort = S.ex.sort[0] === k ? [k, -S.ex.sort[1]] : [k, COL[k][4] || -1]; drawTable(); return; }
  if ((el = t("th[data-hsort]"))) { const k = el.dataset.hsort, st = S.sec; S.sec = st.sort === k ? { sort: k, dir: -st.dir } : { sort: k, dir: k === "sector" ? 1 : (HEAT.find((h) => h[0] === k) || [])[2] === "low" ? 1 : -1 }; route(); return; }
  if (t("[data-more]")) { S.ex.shown += 60; drawTable(); return; }
  if ((el = t("[data-sector]"))) { ev.preventDefault(); if (el.dataset.smkt && S.market === "ALL") { S.market = el.dataset.smkt; store.set("market", S.market); } S.f.sector = el.dataset.sector; S.ex.preset = ""; saveF(); S.ex.shown = 60; go("#/explorar"); return; }
  if ((el = t("[data-t]"))) { hideTip(); go("#/acao/" + encodeURIComponent(el.dataset.t)); }
});
let qTimer;
document.addEventListener("input", (ev) => {
  if (!alive()) return;
  const el = ev.target;
  if (el.id === "fq") { S.f.q = el.value; clearTimeout(qTimer); qTimer = setTimeout(() => { S.ex.shown = 60; route(); const i = $("#fq"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 220); }
  if (el.id === "simv") { store.set("simv", +el.value || 0); const s = S.byTicker[decodeURIComponent(location.hash.split("/")[2] || "")]; if (s) drawSim(s); }
  if (el.id === "nnote") setNote(el.dataset.nt, { note: el.value });
  if (el.id === "ntarget") { const s = S.byTicker[el.dataset.nt], v = +el.value || 0; setNote(el.dataset.nt, { target: v }); const gap = v > 0 ? s.price / v - 1 : null; $("#ntout").textContent = gap === null ? "Sem alvo definido." : gap <= 0 ? `O preço de hoje (${money(s.price, s.currency)}) já está no seu alvo.` : `O preço precisa cair ${pct(gap / (1 + gap), 0)} para chegar ao seu alvo.`; }
});
document.addEventListener("change", (ev) => {
  if (!alive()) return;
  const el = ev.target;
  if (el.id === "fsec") { S.f.sector = el.value; refilter(); }
  if (el.dataset.fsel) { S.f[el.dataset.fsel] = +el.value; refilter(); }
  if (el.id === "mx" || el.id === "my") { S.map[el.id === "mx" ? "x" : "y"] = el.value; S.map.preset = Object.keys(MAP_PRESETS).find((k) => MAP_PRESETS[k][1] === S.map.x && MAP_PRESETS[k][2] === S.map.y) || ""; route(); }
  if (el.id === "mdist") { S.map.dist = el.value; route(); }
  if (el.id === "cmpq") { if (cmpAdd(el.value)) route(); }
  if (el.dataset.nck !== undefined) { const tk = el.dataset.nt, cur = new Set((notes()[tk] || {}).checks || []); el.checked ? cur.add(+el.dataset.nck) : cur.delete(+el.dataset.nck); setNote(tk, { checks: [...cur] }); }
});
window.StocksApp = {
  /** Called by the Ações page each time it is shown. */
  start(el) { app = el; if (S.stocks.length) route(); else { app.innerHTML = '<p class="muted" style="padding:48px 0">Carregando dados…</p>'; load(); } },
};
