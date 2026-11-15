"""US stocks: S&P 500 members (public constituents list) + fundamentals from Yahoo Finance via yfinance."""
from __future__ import annotations

import io
import time

import pandas as pd
import requests
import yfinance as yf

CONSTITUENTS = "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv"
FINANCIAL_SECTORS = ("Financials",)
US_TAX = 0.21


def constituents() -> pd.DataFrame:
    r = requests.get(CONSTITUENTS, timeout=40)
    r.raise_for_status()
    df = pd.read_csv(io.StringIO(r.text))
    df = df.rename(columns={"Symbol": "ticker", "Security": "name", "GICS Sector": "sector", "GICS Sub-Industry": "industry"})
    return df[["ticker", "name", "sector", "industry"]]


def _f(info: dict, key: str):
    v = info.get(key)
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    return v if v == v else None  # drop NaN


def _row(t: str, info: dict) -> dict:
    price = _f(info, "currentPrice") or _f(info, "regularMarketPrice") or _f(info, "previousClose")
    mcap = _f(info, "marketCap")
    shares = _f(info, "sharesOutstanding")
    revenue = _f(info, "totalRevenue")
    op_margin = _f(info, "operatingMargins")
    ebit = revenue * op_margin if revenue and op_margin is not None else None
    ev = _f(info, "enterpriseValue")
    debt = _f(info, "totalDebt") or 0.0
    cash = _f(info, "totalCash") or 0.0
    ebitda = _f(info, "ebitda")
    bvps = _f(info, "bookValue")
    equity = bvps * shares if bvps and shares else None
    fcf = _f(info, "freeCashflow")
    dps = _f(info, "dividendRate") or _f(info, "trailingAnnualDividendRate")
    eps = _f(info, "trailingEps")
    invested = (equity or 0) + debt - cash
    vol = _f(info, "averageDailyVolume3Month") or _f(info, "averageVolume")
    de = _f(info, "debtToEquity")
    return {
        "ticker": t,
        "price": price,
        "market_cap": mcap,
        "pe": _f(info, "trailingPE"),
        "pb": _f(info, "priceToBook"),
        "ps": _f(info, "priceToSalesTrailing12Months"),
        "ev_ebitda": _f(info, "enterpriseToEbitda"),
        "ev_ebit": ev / ebit if ev and ebit and ebit > 0 else None,
        "p_fcf": mcap / fcf if mcap and fcf and fcf > 0 else None,
        "dy": dps / price if dps and price else 0.0,
        "dps": dps,
        "roe": _f(info, "returnOnEquity"),
        "roa": _f(info, "returnOnAssets"),
        "roic": ebit * (1 - US_TAX) / invested if ebit and invested > 0 else None,
        "net_margin": _f(info, "profitMargins"),
        "ebit_margin": op_margin,
        "gross_margin": _f(info, "grossMargins"),
        "debt_equity": de / 100.0 if de is not None else None,
        "net_debt_ebitda": (debt - cash) / ebitda if ebitda and ebitda > 0 else None,
        "current_ratio": _f(info, "currentRatio"),
        "rev_growth": _f(info, "revenueGrowth"),
        "eps": eps,
        "bvps": bvps,
        "liquidity": vol * price if vol and price else None,
        "equity": equity,
        "beta": _f(info, "beta"),
    }


def fetch(limit: int | None = None) -> pd.DataFrame:
    base = constituents()
    if limit:
        base = base.head(limit)
    rows, failed = [], []
    for t in base["ticker"]:
        ysym = t.replace(".", "-")  # BRK.B -> BRK-B
        info = None
        for attempt in range(3):
            try:
                info = yf.Ticker(ysym).info
                if info and (info.get("currentPrice") or info.get("regularMarketPrice")):
                    break
            except Exception:
                info = None
            time.sleep(3 * (attempt + 1))
        if not info:
            failed.append(t)
            continue
        rows.append(_row(t, info))
        time.sleep(0.25)
    df = pd.DataFrame(rows).merge(base, on="ticker", how="left")
    df["market"] = "US"
    df["currency"] = "USD"
    df["is_financial"] = df["sector"].isin(FINANCIAL_SECTORS)
    df.attrs["failed"] = failed
    return df
