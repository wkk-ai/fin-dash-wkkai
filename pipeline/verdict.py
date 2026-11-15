"""Answers "is this stock cheap AND worth a look right now?" with reasons.

Adds to each stock:
  dims     five 0-100 scores, ranked inside market + sector: valor, rentabilidade, seguranca, estabilidade, tendencia
  signals  up to ten yes/no checks, each with the number behind it: [id, ok (True/False/None), detail]
  sig_ok / sig_total
  verdict  oportunidade | barata_risco | boa_cara | neutra | evitar

Rules follow .claude/skills/financial-expert/SKILL.md: cheap alone is not enough (McKinsey: return must beat the
cost of capital), balance sheet first (Graham), earnings yield vs bonds (Graham), normalized earnings.
Price trend is shown as context ("not a falling knife"); it is a signal, never part of the cheapness score.
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

from pipeline.score import HURDLE, _weighted

GRAVE = {"lucro_negativo", "patrimonio_negativo", "divida_alta", "cobertura_baixa", "pico_ciclo"}

DIM_W = {
    "rentabilidade": ({"roic": (50, "high"), "ebit_margin": (25, "high"), "net_margin": (25, "high")},
                      {"roe": (70, "high"), "net_margin": (30, "high")}),
    "seguranca": ({"net_debt_ebitda": (45, "low"), "coverage": (30, "high"), "current_ratio": (25, "high")}, None),
    "estabilidade": ({"profit_stability": (45, "high"), "div_share": (25, "high"), "ni_growth_10": (30, "high")},) * 2,
    "tendencia": ({"ret_12m": (50, "high"), "vs_ma200": (50, "high")},) * 2,
}


def _n(v):
    return None if v is None or (isinstance(v, float) and (math.isnan(v) or math.isinf(v))) else v


def _pct(v, d=1):
    return f"{v * 100:.{d}f}%".replace(".", ",")


def _x(v, d=1):
    return f"{v:.{d}f}".replace(".", ",")


def signals(r: pd.Series, rf: float | None) -> list:
    fin = bool(r.get("is_financial"))
    br = r.get("market") == "BR"
    g = lambda k: _n(r.get(k))  # noqa: E731
    out = []

    def add(sid, ok, detail):
        out.append([sid, None if ok is None else bool(ok), detail])

    vs = g("value_score")
    add("barata_setor", None if vs is None else vs >= 60,
        "" if vs is None else f"múltiplos mais baratos que {vs:.0f}% do setor")

    pe = g("pe")
    if pe and pe > 0 and rf:
        ey = 1 / pe
        add("rend_lucro", ey >= rf, f"lucro rende {_pct(ey)} ao ano sobre o preço; {'Selic' if br else 'Treasury 10 anos'} paga {_pct(rf, 2)}")
    else:
        add("rend_lucro", False if (pe is not None and pe <= 0) else None, "sem lucro nos últimos 12 meses" if pe is not None and pe <= 0 else "")

    gv, price = g("graham_value"), g("price")
    if gv and price:
        gap = 1 - price / gv if price <= gv else price / gv - 1
        add("graham", price <= gv, f"preço {_pct(gap, 0)} {'abaixo' if price <= gv else 'acima'} do número de Graham")
    else:
        add("graham", None, "")

    p3 = g("pe_avg3")
    add("pl_normal", None if p3 is None else p3 <= 15, "" if p3 is None else f"{_x(p3)}× o lucro médio de 3 anos (Graham aceita até 15×)")

    ret = g("roe") if fin else g("roic")
    hurdle = HURDLE.get(r.get("market"), 0.10)
    add("rentavel", None if ret is None else ret >= hurdle,
        "" if ret is None else f"{'ROE' if fin else 'ROIC'} de {_pct(ret)} contra custo de capital perto de {_pct(hurdle, 0)}")

    if fin:
        add("divida", None, "")
    else:
        nde, cov = g("net_debt_ebitda"), g("coverage")
        if nde is None and cov is None:
            add("divida", None, "")
        else:
            ok = (nde is None or nde <= 3) and (cov is None or cov >= 2)
            parts = []
            if nde is not None:
                parts.append("caixa maior que a dívida" if nde < 0 else f"dívida líquida de {_x(nde)}× o EBITDA")
            if cov is not None:
                parts.append("sem peso de juros" if cov >= 50 else f"lucro operacional cobre os juros {_x(cov)}×")
            add("divida", ok, "; ".join(parts))

    hy, ly = g("hist_years"), g("loss_years")
    if hy and hy >= 5:
        add("estavel", ly == 0, f"lucro em {int(hy - (ly or 0))} dos últimos {int(hy)} anos")
    else:
        add("estavel", None, "")

    cq = g("cfo_ni_3")
    if fin or cq is None:
        add("caixa", None, "")
    else:
        add("caixa", cq >= 0.8, f"caixa da operação foi {_x(cq, 2)}× o lucro em 3 anos")

    dy, dyrs = g("dy"), g("div_years")
    if dy is None:
        add("dividendos", None, "")
    else:
        floor = 0.04 if br else 0.015
        ok = floor <= dy <= 0.15 and (not hy or dyrs is None or dyrs >= 0.7 * hy)
        d = f"dividend yield de {_pct(dy)}"
        if hy and dyrs is not None:
            d += f"; pagou em {int(dyrs)} de {int(hy)} anos"
        if dy > 0.15:
            d += " (atípico, provavelmente não se repete)"
        add("dividendos", ok, d)

    vm, r12 = g("vs_ma200"), g("ret_12m")
    if vm is None:
        add("tendencia", None, "")
    else:
        d = f"preço {_pct(abs(vm), 0)} {'acima' if vm >= 0 else 'abaixo'} da média de 200 dias"
        if r12 is not None:
            d += f"; {'+' if r12 >= 0 else ''}{_pct(r12, 0)} em 12 meses"
        add("tendencia", vm >= 0, d)
    return out


def classify(r: pd.Series) -> str:
    v, q = _n(r.get("value_score")) or 0, _n(r.get("quality_score")) or 0
    fl = set(r.get("flags") or [])
    grave = fl & GRAVE
    share = (r["sig_ok"] / r["sig_total"]) if r["sig_total"] else 0
    if "patrimonio_negativo" in fl or ("lucro_negativo" in fl and q < 50) or (v < 40 and q < 40):
        return "evitar"
    if v >= 60 and q >= 55 and not grave and share >= 0.6 and "retorno_abaixo_custo" not in fl:
        return "oportunidade"
    if v >= 60:
        return "barata_risco"
    if q >= 65 and not grave:
        return "boa_cara"
    return "neutra"


def apply(df: pd.DataFrame, macro: dict) -> pd.DataFrame:
    df = df.copy()
    for c in ("ret_12m", "vs_ma200", "pos_52w", "profit_stability", "div_years", "hist_years", "ni_growth_10", "coverage"):
        df[c] = pd.to_numeric(df[c], errors="coerce") if c in df else np.nan
    df["div_share"] = (df["div_years"] / df["hist_years"].where(df["hist_years"] > 0)).clip(0, 1)
    if df["profit_stability"].isna().all() and "profit_years" in df:
        df["profit_stability"] = pd.to_numeric(df["profit_years"], errors="coerce") / df["hist_years"].where(df["hist_years"] > 0)
    fin = df["is_financial"].fillna(False).astype(bool)

    dims = {"valor": df["value_score"]}
    for name, (w, wfin) in DIM_W.items():
        a = _weighted(df, w)
        if wfin is None:
            dims[name] = a.where(~fin)
        else:
            dims[name] = a.where(~fin, _weighted(df, wfin)) if wfin is not w else a
    dd = pd.DataFrame(dims).round(0)
    df["dims"] = [{k: (None if pd.isna(v) else int(v)) for k, v in row.items()} for row in dd.to_dict(orient="records")]

    rfs = {"BR": macro.get("selic"), "US": macro.get("us10y")}
    sigs = [signals(r, rfs.get(r["market"])) for _, r in df.iterrows()]
    df["signals"] = sigs
    df["sig_ok"] = [sum(1 for s in ss if s[1] is True) for ss in sigs]
    df["sig_total"] = [sum(1 for s in ss if s[1] is not None) for ss in sigs]
    df["verdict"] = df.apply(classify, axis=1)
    return df
