"""Turn multi-year fundamentals (pipeline/data/fundamentals.json) into the metrics the books ask for.

Graham (The Intelligent Investor, ch. 14): P/E on 3-year average earnings, 10 years of profits,
uninterrupted dividends, +1/3 earnings growth over 10 years (3-yr averages), strong balance sheet.
McKinsey / Rosenbaum: interest coverage, cash conversion (operating cash flow vs net income),
mid-cycle margins for cyclicals.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

FUND = Path(__file__).resolve().parent / "data" / "fundamentals.json"

HIST_COLS = [
    "hist_years", "profit_years", "loss_years", "loss_last5", "div_years", "ni_avg3", "pe_avg3", "ni_growth_10",
    "coverage", "cfo_ni_3", "ebit_margin_avg", "ebit_margin_last", "ltd", "wc", "profit_stability",
]


def load() -> dict:
    if not FUND.exists():
        return {}
    try:
        return json.loads(FUND.read_text())
    except (OSError, ValueError):
        return {}


def _avg(xs):
    xs = [x for x in xs if x is not None and not (isinstance(x, float) and math.isnan(x))]
    return sum(xs) / len(xs) if xs else None


def metrics_for(h: dict, market_cap: float | None) -> dict:
    """h: {year: {field: value}}; uses the last 10 years available."""
    years = sorted(y for y in h if h[y].get("ni") is not None)[-10:]
    out: dict = {k: None for k in HIST_COLS}
    if not years:
        return out
    ni = [h[y]["ni"] for y in years]
    out["hist_years"] = len(years)
    out["profit_years"] = sum(1 for v in ni if v > 0)
    out["loss_years"] = sum(1 for v in ni if v <= 0)
    out["profit_stability"] = out["profit_years"] / len(years)
    out["loss_last5"] = any(v <= 0 for v in ni[-5:])
    divs = [h[y].get("div") for y in years]
    out["div_years"] = sum(1 for d in divs if d and d > 0)
    a3 = _avg(ni[-3:])
    out["ni_avg3"] = a3
    if a3 and a3 > 0 and market_cap and market_cap > 0:
        out["pe_avg3"] = market_cap / a3
    if len(years) >= 7:
        first, last = _avg(ni[:3]), a3
        if first and first > 0 and last is not None:
            out["ni_growth_10"] = last / first - 1
    ly = h[years[-1]]
    ebit, ie = ly.get("ebit"), ly.get("int_exp")
    if ie is not None and ly.get("fin_inc") is not None:
        # Brazil: "despesas financeiras" also carry FX and inflation restatement, and cash earns Selic,
        # so use the NET financial expense (expenses - financial income) as the interest burden.
        ie = ie - ly["fin_inc"]
    if ebit is not None and ie is not None:
        out["coverage"] = (ebit / ie) if ie > 0 else (50.0 if ebit > 0 else None)
    s_ni = sum(ni[-3:])
    s_cfo = [h[y].get("cfo") for y in years[-3:]]
    if s_ni > 0 and all(c is not None for c in s_cfo):
        out["cfo_ni_3"] = sum(s_cfo) / s_ni
    margins = [h[y]["ebit"] / h[y]["rev"] for y in years if h[y].get("ebit") is not None and h[y].get("rev")]
    if len(margins) >= 5:
        out["ebit_margin_avg"] = _avg(margins)
        out["ebit_margin_last"] = margins[-1]
    out["ltd"] = ly.get("ltd")
    if ly.get("ca") is not None and ly.get("cl") is not None:
        out["wc"] = ly["ca"] - ly["cl"]
    return out


def add_history(df: pd.DataFrame, fund: dict) -> tuple[pd.DataFrame, dict]:
    """Adds history columns to df. Returns (df, series) where series feeds the chart on the stock page."""
    rows, series = [], {}
    for _, r in df.iterrows():
        h = (fund.get(r["market"]) or {}).get(r["ticker"]) or {}
        m = metrics_for(h, r.get("market_cap"))
        rows.append(m)
        if h:
            ys = sorted(h)[-12:]
            series[r["ticker"]] = [[int(y), h[y].get("ni"), h[y].get("rev"), h[y].get("ebit"), h[y].get("div")] for y in ys]
    hist = pd.DataFrame(rows, index=df.index)
    for c in HIST_COLS:
        df[c] = hist[c]
    return df, series


def graham_checklist(r: pd.Series, big_cap: float) -> list[str]:
    """Graham's seven defensive tests (ch. 14). Each item: 'ok', 'fail' or 'na' (data missing / not applicable)."""
    def ok(cond):
        return "na" if cond is None else ("ok" if cond else "fail")

    def num(k):
        v = r.get(k)
        return None if v is None or (isinstance(v, float) and math.isnan(v)) else v

    fin = bool(r.get("is_financial"))
    sec = str(r.get("sector") or "").lower()
    utility = any(k in sec for k in ("energia elétrica", "saneamento", "utilities"))
    mc, cr, ltd, wc, eq = num("market_cap"), num("current_ratio"), num("ltd"), num("wc"), None
    pe3, pe, pb = num("pe_avg3"), num("pe"), num("pb")
    hy = num("hist_years") or 0

    size = None if mc is None else mc >= big_cap
    if fin:
        strength = None
    elif utility:
        equity = (mc / pb) if mc and pb and pb > 0 else None
        strength = None if ltd is None or equity is None else ltd <= 2 * equity
    else:
        strength = None if cr is None else (cr >= 2 and (ltd is None or wc is None or ltd <= wc))
    stability = None if hy < 8 else num("loss_years") == 0
    dividends = None if hy < 8 else num("div_years") == hy
    g = num("ni_growth_10")
    growth = None if g is None else g >= 1 / 3
    pe_use = pe3 if pe3 is not None else (pe if pe and pe > 0 else None)
    pe_ok = None if pe_use is None else pe_use <= 15
    pb_ok = None if pb is None or pb <= 0 or pe_use is None else (pb <= 1.5 or pe_use * pb <= 22.5)
    return [ok(size), ok(strength), ok(stability), ok(dividends), ok(growth), ok(pe_ok), ok(pb_ok)]


def apply_graham(df: pd.DataFrame) -> pd.DataFrame:
    checks = []
    caps = {m: df.loc[df["market"] == m, "market_cap"].quantile(2 / 3) for m in df["market"].unique()}
    for _, r in df.iterrows():
        checks.append(graham_checklist(r, caps.get(r["market"], np.inf)))
    df["graham_checks"] = checks
    df["graham_score"] = [sum(1 for c in cs if c == "ok") for cs in checks]
    df["graham_total"] = [sum(1 for c in cs if c != "na") for cs in checks]
    return df
