"""Brazilian stocks (B3) from Fundamentus: one table with every listed stock, plus sector lists.

Fundamentus serves ISO-8859-1 HTML with pt-BR numbers ("1.234,56", "12,3%", "-" for missing).
"""
from __future__ import annotations

import re
import time

import lxml.html
import pandas as pd
import requests

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"}
BASE = "https://www.fundamentus.com.br"

# Column order of resultado.php (mapped by position because headers carry accents).
COLS = [
    "ticker", "price", "pe", "pb", "ps", "dy", "p_assets", "p_wc", "p_ebit", "p_ncav",
    "ev_ebit", "ev_ebitda", "gross_margin", "ebit_margin", "net_margin", "current_ratio", "roic", "roe",
    "liquidity", "equity", "net_debt_equity", "rev_growth",
]
PCT = {"dy", "gross_margin", "ebit_margin", "net_margin", "roic", "roe", "rev_growth"}

FINANCIAL_SECTORS = ("financeiro", "intermediários financeiros", "bancos", "previdência e seguros", "seguros", "serviços financeiros")


def _num(v):
    if v is None:
        return None
    s = str(v).strip().replace("%", "").replace(" ", "")
    if s in ("", "-", "nan"):
        return None
    s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def _get(url: str, session: requests.Session) -> str:
    for attempt in range(4):
        r = session.get(url, headers=UA, timeout=40)
        if r.status_code == 200:
            r.encoding = "ISO-8859-1"
            return r.text
        time.sleep(2 * (attempt + 1))
    r.raise_for_status()
    return ""


def _parse_table(html: str) -> pd.DataFrame:
    # Parse cells as raw text so pt-BR numbers are converted by _num only once.
    doc = lxml.html.fromstring(html)
    rows = []
    for tr in doc.xpath("//table//tr"):
        cells = [c.text_content().strip() for c in tr.xpath("./td")]
        if len(cells) >= len(COLS) and re.match(r"^[A-Z0-9]{4}\d{1,2}$", cells[0]):
            rows.append(cells[: len(COLS)])
    if rows and not getattr(_parse_table, "_shown", False):
        _parse_table._shown = True
        heads = [h.text_content().strip() for h in doc.xpath("//table//th")]
        print("fundamentus headers:", heads)
        print("fundamentus first row:", rows[0])
    raw = pd.DataFrame(rows, columns=COLS)
    df = pd.DataFrame({"ticker": raw["ticker"]})
    for c in COLS[1:]:
        df[c] = raw[c].map(_num)
    for c in PCT:
        df[c] = df[c] / 100.0
    return df


def details(ticker: str, session: requests.Session) -> dict:
    """Company name, sector and subsector from the stock page."""
    html = _get(f"{BASE}/detalhes.php?papel={ticker}", session)
    doc = lxml.html.fromstring(html)
    out = {}
    cells = [c.text_content().strip() for c in doc.xpath("//td")]
    for i, c in enumerate(cells[:-1]):
        label = c.lstrip("?").strip().lower()
        if label in ("empresa", "setor", "subsetor") and label not in out:
            out[label] = cells[i + 1]
    return out


def fetch(min_liquidity: float = 0) -> pd.DataFrame:
    s = requests.Session()
    df = _parse_table(_get(f"{BASE}/resultado.php", s))
    total = len(df)
    df = df[(df["liquidity"].fillna(0) >= min_liquidity) & (df["price"].fillna(0) > 0)].copy()
    names, secs, subs = {}, {}, {}
    for t in df["ticker"]:
        try:
            d = details(t, s)
        except Exception:  # noqa: BLE001
            d = {}
        names[t], secs[t], subs[t] = d.get("empresa") or t, d.get("setor") or "Outros", d.get("subsetor")
        time.sleep(0.3)
    print(f"fundamentus: {total} listed, {len(df)} liquid, {len(set(secs.values()))} sectors")
    df["name"] = df["ticker"].map(names)
    df["sector"] = df["ticker"].map(secs)
    df["industry"] = df["ticker"].map(subs)
    df["market"] = "BR"
    df["currency"] = "BRL"
    df.attrs["total"] = total

    # Derived absolute values (all from the same row, so they are consistent).
    mcap = df["equity"] * df["pb"]
    df["market_cap"] = mcap
    df["eps"] = df["price"] / df["pe"].where(df["pe"] != 0)
    df["bvps"] = df["price"] / df["pb"].where(df["pb"] != 0)
    df["dps"] = df["dy"] * df["price"]
    ebit = mcap / df["p_ebit"].where(df["p_ebit"] != 0)
    ev = df["ev_ebit"] * ebit
    ebitda = ev / df["ev_ebitda"].where(df["ev_ebitda"] != 0)
    df["net_debt_ebitda"] = (ev - mcap) / ebitda.where(ebitda > 0)
    assets = mcap / df["p_assets"].where(df["p_assets"] != 0)
    net_income = mcap / df["pe"].where(df["pe"] != 0)
    df["roa"] = net_income / assets
    df["p_fcf"] = None
    df["debt_equity"] = df["net_debt_equity"]
    df["is_financial"] = df["sector"].str.lower().apply(lambda x: any(k in x for k in FINANCIAL_SECTORS))
    return df
