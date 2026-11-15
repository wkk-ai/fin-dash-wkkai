"""Cheapness and quality scores. Rules come from .claude/skills/financial-expert/SKILL.md (sections 4-6)."""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

from pipeline.hist_metrics import apply_graham

MIN_PEERS = 5

# metric -> (weight, direction) ; direction "low" means lower value = cheaper/better
# pe_avg3 = market cap / average net income of the last 3 years (Graham's normalized P/E).
# Missing metrics (e.g. no history) have their weight redistributed among the others.
VALUE_W = {"ev_ebit": (25, "low"), "pe": (10, "low"), "pe_avg3": (10, "low"), "pb": (15, "low"), "p_fcf": (8, "low"), "ps": (7, "low"), "ev_ebitda": (15, "low"), "dy": (10, "high")}
VALUE_W_FIN = {"pe": (20, "low"), "pe_avg3": (20, "low"), "pb": (40, "low"), "dy": (20, "high")}
QUAL_W = {"roic": (30, "high"), "ebit_margin": (8, "high"), "net_margin": (7, "high"), "rev_growth": (10, "high"), "net_debt_ebitda": (15, "low"),
          "current_ratio": (5, "high"), "profit_stability": (10, "high"), "coverage": (10, "high"), "cfo_ni_3": (5, "high")}
QUAL_W_FIN = {"roe": (50, "high"), "net_margin": (10, "high"), "rev_growth": (15, "high"), "profit_stability": (25, "high")}

CYCLICAL = ("mineração", "siderurgia", "petróleo", "papel e celulose", "materials", "energy", "químicos")
UTILITY = ("energia elétrica", "saneamento", "utilities", "água e saneamento")


def _valid(df: pd.DataFrame, m: str) -> pd.Series:
    s = pd.to_numeric(df[m], errors="coerce")
    if m in ("pe", "pe_avg3", "pb", "ev_ebit", "ev_ebitda", "p_fcf", "ps"):
        s = s.where(s > 0)  # negative multiples mean losses or negative equity, not cheapness
    if m == "dy":
        s = s.clip(upper=0.15)  # DY above 15% is usually one-off; cap so it cannot dominate
    if m == "net_debt_ebitda":
        s = s.clip(lower=-2)
    if m == "coverage":
        s = s.clip(upper=20)
    if m == "cfo_ni_3":
        s = s.clip(-1, 2)
    return s


def _pct(df: pd.DataFrame, m: str, direction: str) -> pd.Series:
    vals = _valid(df, m)
    out = pd.Series(np.nan, index=df.index)
    groups = df.groupby(["market", "sector"]).groups
    for (mkt, _), idx in groups.items():
        v = vals.loc[idx]
        pool = v if v.notna().sum() >= MIN_PEERS else vals[df["market"] == mkt]
        r = pool.rank(pct=True, ascending=(direction == "high"))
        out.loc[idx] = r.reindex(idx)
    return out * 100


def _weighted(df: pd.DataFrame, weights: dict) -> pd.Series:
    num = pd.Series(0.0, index=df.index)
    den = pd.Series(0.0, index=df.index)
    for m, (w, d) in weights.items():
        p = _pct(df, m, d)
        has = p.notna()
        num[has] += p[has] * w
        den[has] += w
    return (num / den.where(den > 0)).round(1)


def flags(r: pd.Series) -> list[str]:
    f = []
    sec = str(r.get("sector") or "").lower()
    pe, dy, roe = r.get("pe"), r.get("dy"), r.get("roe")
    if pe is None or (isinstance(pe, float) and math.isnan(pe)) or pe <= 0:
        f.append("lucro_negativo")
    elif pe < 3:
        f.append("pl_muito_baixo")
    if dy is not None and not pd.isna(dy) and dy > 0.15:
        f.append("dy_atipico")
    if not r.get("is_financial"):
        nde = r.get("net_debt_ebitda")
        if nde is not None and not pd.isna(nde) and nde > 4:
            f.append("divida_alta")
        cr = r.get("current_ratio")
        if cr is not None and not pd.isna(cr) and cr < 1:
            f.append("liquidez_corrente_baixa")
    if roe is not None and not pd.isna(roe) and roe > 0.6:
        f.append("roe_alavancado")
    pb = r.get("pb")
    if pb is not None and not pd.isna(pb) and pb < 0:
        f.append("patrimonio_negativo")
    g = r.get("rev_growth")
    if g is not None and not pd.isna(g) and g < 0:
        f.append("receita_caindo")
    cyc = any(k in sec for k in CYCLICAL)
    if cyc:
        f.append("ciclica")
    def v(k):
        x = r.get(k)
        return None if x is None or (isinstance(x, float) and math.isnan(x)) else x
    if not r.get("is_financial"):
        cov = v("coverage")
        if cov is not None and cov < 2:
            f.append("cobertura_baixa")  # McKinsey: EBITA/interest < 2 is unsustainable
        cq = v("cfo_ni_3")
        if cq is not None and cq < 0.5:
            f.append("lucro_sem_caixa")  # profit not turning into operating cash
        ma, ml = v("ebit_margin_avg"), v("ebit_margin_last")
        if cyc and ma and ml and ma > 0 and ml > 1.3 * ma:
            f.append("pico_ciclo")  # margin well above its multi-year average
    if r.get("loss_last5") is True and "lucro_negativo" not in f:
        f.append("prejuizo_recente")
    # Value trap core test (McKinsey): low multiple with return below cost of capital is deserved, not cheap.
    ret = roe if r.get("is_financial") else r.get("roic")
    hurdle = HURDLE.get(r.get("market"), 0.10)
    if ret is not None and not pd.isna(ret) and ret < hurdle:
        f.append("retorno_abaixo_custo")
    return f


# Rough cost of capital by market (McKinsey: US WACC ~8-9%; Brazil nominal BRL much higher with Selic ~15%).
HURDLE = {"US": 0.08, "BR": 0.13}

PENALTY = {"cobertura_baixa": 8, "lucro_sem_caixa": 5, "pico_ciclo": 5, "prejuizo_recente": 4, "retorno_abaixo_custo": 6, "lucro_negativo": 15, "pl_muito_baixo": 8, "dy_atipico": 8, "divida_alta": 10, "liquidez_corrente_baixa": 5, "roe_alavancado": 5, "patrimonio_negativo": 20, "receita_caindo": 5, "ciclica": 3}


def score(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    num_cols = ["price", "market_cap", "pe", "pb", "ps", "ev_ebitda", "ev_ebit", "p_fcf", "dy", "dps", "roe", "roic", "roa",
                "net_margin", "ebit_margin", "gross_margin", "debt_equity", "net_debt_ebitda", "current_ratio",
                "rev_growth", "eps", "bvps", "liquidity", "p_ncav", "pe_avg3", "profit_stability", "coverage", "cfo_ni_3",
                "ebit_margin_avg", "ebit_margin_last", "loss_years", "div_years", "hist_years", "ni_growth_10", "ltd", "wc"]
    for c in num_cols:
        df[c] = pd.to_numeric(df[c], errors="coerce") if c in df else np.nan
    fin = df["is_financial"].fillna(False).astype(bool)
    v_all, v_fin = _weighted(df, VALUE_W), _weighted(df, VALUE_W_FIN)
    q_all, q_fin = _weighted(df, QUAL_W), _weighted(df, QUAL_W_FIN)
    df["value_score"] = v_all.where(~fin, v_fin)
    df["quality_score"] = q_all.where(~fin, q_fin)
    df["flags"] = df.apply(flags, axis=1)
    pen = df["flags"].apply(lambda fs: sum(PENALTY.get(x, 0) for x in fs))
    base = 0.6 * df["value_score"].fillna(0) + 0.4 * df["quality_score"].fillna(50)
    df["final_score"] = (base - pen).clip(lower=0).round(1)

    # Reference fair prices (educational, never advice).
    eps, bvps = pd.to_numeric(df["eps"], errors="coerce"), pd.to_numeric(df["bvps"], errors="coerce")
    ok = (eps > 0) & (bvps > 0)
    df["graham_value"] = np.where(ok, np.sqrt(22.5 * eps.clip(lower=0) * bvps.clip(lower=0)), np.nan)
    dps = pd.to_numeric(df.get("dps"), errors="coerce")
    df["bazin_price"] = np.where(dps > 0, dps / 0.06, np.nan)

    # Greenblatt magic formula rank (non-financials, utilities excluded) inside each market.
    sec = df["sector"].fillna("").str.lower()
    eligible = ~fin & ~sec.apply(lambda s: any(k in s for k in UTILITY)) & (df["ev_ebit"] > 0) & (df["roic"] > 0)
    df["magic_rank"] = np.nan
    for mkt in df["market"].unique():
        m = eligible & (df["market"] == mkt)
        r = df.loc[m, "ev_ebit"].rank() + df.loc[m, "roic"].rank(ascending=False)
        df.loc[m, "magic_rank"] = r.rank(method="first")

    # Graham defensive investor: the seven tests of ch. 14 (history-based ones need fundamentals.json).
    df = apply_graham(df)
    snap = (df["pe"] > 0) & (df["pe"] <= 15) & (df["pb"] > 0) & ((df["pe"] * df["pb"]) <= 22.5) & (fin | (df["current_ratio"].fillna(0) >= 1.5))
    full = (df["graham_total"] >= 6) & (df["graham_score"] == df["graham_total"])  # every test with data must pass
    df["graham_pass"] = np.where(df["graham_total"] >= 6, full, snap)

    # Graham enterprising investor (Intelligent Investor ch. 15), with snapshot data:
    # P/E <= 9, current ratio >= 1.5, some dividend, profitable, price <= 1.2x book.
    df["graham_ent"] = (df["pe"] > 0) & (df["pe"] <= 9) & (df["pb"] > 0) & (df["pb"] <= 1.2) & (df["dy"].fillna(0) > 0) & (fin | (df["current_ratio"].fillna(0) >= 1.5))

    # Net-net (ch. 15): NCAV = current assets - total liabilities. Fundamentus gives price / NCAV per share.
    pn = pd.to_numeric(df["p_ncav"], errors="coerce") if "p_ncav" in df else pd.Series(np.nan, index=df.index)
    df["p_ncav"] = pn
    df["net_net"] = (~fin) & (pn > 0) & (pn < 1) & (df["pe"] > 0)
    return df
