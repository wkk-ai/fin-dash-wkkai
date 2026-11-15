"""Daily job: fetch B3 + S&P 500, score, write public/stocks/data/*.json and (if DATABASE_URL is set) Neon.

Usage: python -m pipeline.run [--us-limit N] [--skip-us] [--skip-br]
"""
from __future__ import annotations

import argparse
import datetime as dt
import io
import json
import math
import os
import sys
import time
from pathlib import Path

import pandas as pd
import requests

from pipeline import fetch_br, fetch_us
from pipeline.hist_metrics import add_history, load as load_fund
from pipeline.score import score

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "stocks" / "data"
MIN_LIQ_BR = 200_000  # R$ per day; below this the quoted price is hard to trade

FIELDS = [
    "ticker", "market", "name", "sector", "industry", "currency", "price", "market_cap", "pe", "pb", "ps",
    "ev_ebitda", "ev_ebit", "p_fcf", "dy", "roe", "roic", "roa", "net_margin", "ebit_margin", "gross_margin",
    "debt_equity", "net_debt_ebitda", "current_ratio", "rev_growth", "eps", "bvps", "dps", "liquidity",
    "graham_value", "bazin_price", "value_score", "quality_score", "final_score", "magic_rank", "graham_pass",
    "graham_ent", "net_net", "p_ncav", "is_financial", "flags",
    "pe_avg3", "profit_years", "loss_years", "hist_years", "div_years", "ni_growth_10", "coverage", "cfo_ni_3",
    "ebit_margin_avg", "graham_checks", "graham_score", "graham_total",
    "ret_12m", "vs_ma200", "pos_52w", "lo_52w", "hi_52w", "spark", "dims", "signals", "sig_ok", "sig_total", "verdict",
]


def macro() -> dict:
    out = {}
    for attempt in range(3):
        try:
            r = requests.get("https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json", timeout=30)
            out["selic"] = float(r.json()[0]["valor"].replace(",", ".")) / 100
            break
        except Exception as e:  # noqa: BLE001
            print("macro selic failed:", e, file=sys.stderr)
            time.sleep(5 * (attempt + 1))
    try:
        r = requests.get("https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/12?formato=json", timeout=30)
        acc = 1.0
        for x in r.json():
            acc *= 1 + float(x["valor"].replace(",", ".")) / 100
        out["ipca_12m"] = acc - 1
    except Exception as e:  # noqa: BLE001
        print("macro ipca failed:", e, file=sys.stderr)
    try:  # CBOE 10-year Treasury yield index; quoted in percent
        import yfinance as yf
        h = yf.Ticker("^TNX").history(period="10d")["Close"].dropna()
        out["us10y"] = float(h.iloc[-1]) / 100
    except Exception as e:  # noqa: BLE001
        print("macro us10y failed:", e, file=sys.stderr)
    missing = [k for k in ("selic", "ipca_12m", "us10y") if k not in out]
    if missing and os.environ.get("DATABASE_URL"):  # a source was down today: reuse the last value saved in Neon
        try:
            import psycopg
            with psycopg.connect(os.environ["DATABASE_URL"]) as con, con.cursor() as cur:
                for k in missing:
                    cur.execute("SELECT value FROM macro WHERE key = %s ORDER BY snap_date DESC LIMIT 1", (k,))
                    row = cur.fetchone()
                    if row:
                        out[k] = float(row[0])
                        print(f"macro {k}: using last saved value {out[k]}")
        except Exception as e:  # noqa: BLE001
            print("macro fallback failed:", e, file=sys.stderr)
    return out


def _clean(v):
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    if isinstance(v, float):
        return round(v, 6)
    if hasattr(v, "item"):
        return _clean(v.item())
    return v


def to_records(df: pd.DataFrame) -> list[dict]:
    recs = []
    for r in df[FIELDS].to_dict(orient="records"):
        recs.append({k: (_clean(v) if not isinstance(v, (list, dict)) else v) for k, v in r.items()})
    return recs


def save_neon(df: pd.DataFrame, mac: dict, day: dt.date, notes: str) -> None:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("DATABASE_URL not set: skipping Neon write")
        return
    import psycopg

    cols = ["price", "market_cap", "pe", "pb", "ps", "ev_ebitda", "ev_ebit", "p_fcf", "dy", "roe", "roic", "roa",
            "net_margin", "ebit_margin", "gross_margin", "debt_equity", "net_debt_ebitda", "current_ratio", "rev_growth",
            "eps", "bvps", "liquidity", "graham_value", "bazin_price", "value_score", "quality_score", "final_score"]
    recs = to_records(df)
    with psycopg.connect(url) as con, con.cursor() as cur:
        cur.executemany(
            "INSERT INTO stocks (ticker, market, name, sector, industry, currency, updated_at) VALUES (%s,%s,%s,%s,%s,%s,now()) "
            "ON CONFLICT (ticker) DO UPDATE SET market=EXCLUDED.market, name=EXCLUDED.name, sector=EXCLUDED.sector, "
            "industry=EXCLUDED.industry, currency=EXCLUDED.currency, updated_at=now()",
            [(r["ticker"], r["market"], r["name"], r["sector"], r.get("industry"), r["currency"]) for r in recs],
        )
        ph = ",".join(["%s"] * (len(cols) + 3))
        upd = ",".join(f"{c}=EXCLUDED.{c}" for c in cols + ["flags"])
        cur.executemany(
            f"INSERT INTO snapshots (snap_date, ticker, {','.join(cols)}, flags) VALUES ({ph}) "
            f"ON CONFLICT (snap_date, ticker) DO UPDATE SET {upd}",
            [(day, r["ticker"], *[r.get(c) for c in cols], r["flags"]) for r in recs],
        )
        cur.executemany(
            "INSERT INTO macro (snap_date, key, value) VALUES (%s,%s,%s) ON CONFLICT (snap_date, key) DO UPDATE SET value=EXCLUDED.value",
            [(day, k, v) for k, v in mac.items()],
        )
        n_br = int((df["market"] == "BR").sum())
        cur.execute("INSERT INTO runs (finished_at, status, rows_br, rows_us, notes) VALUES (now(), 'ok', %s, %s, %s)",
                    (n_br, len(df) - n_br, notes))
        # 180-day score history for the site's detail page.
        cur.execute(
            "SELECT ticker, snap_date, final_score, price FROM snapshots WHERE snap_date >= %s ORDER BY ticker, snap_date",
            (day - dt.timedelta(days=180),),
        )
        hist: dict[str, list] = {}
        for t, d, s, p in cur.fetchall():
            hist.setdefault(t, []).append([d.isoformat(), float(s) if s is not None else None, float(p) if p is not None else None])
    (OUT / "history.json").write_text(json.dumps(hist, separators=(",", ":")))
    print("Neon write ok:", len(recs), "rows")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--us-limit", type=int, default=None)
    ap.add_argument("--skip-us", action="store_true")
    ap.add_argument("--skip-br", action="store_true")
    a = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    frames, notes = [], []
    if not a.skip_br:
        br = fetch_br.fetch(MIN_LIQ_BR)
        print(f"BR: {br.attrs.get('total')} listed, {len(br)} with liquidity >= R$ {MIN_LIQ_BR:,}")
        frames.append(br)
    if not a.skip_us:
        us = fetch_us.fetch(a.us_limit)
        failed = us.attrs.get("failed", [])
        print(f"US: {len(us)} fetched, {len(failed)} failed: {failed[:20]}")
        if failed:
            notes.append(f"US failed: {','.join(failed)}")
        frames.append(us)
    df = pd.concat(frames, ignore_index=True)
    for c in FIELDS:
        if c not in df.columns:
            df[c] = None
    fund = load_fund()
    df, series = add_history(df, fund)
    print("history coverage:", {m: int(df.loc[df["market"] == m, "hist_years"].notna().sum()) for m in ("BR", "US")})
    # Price history first: the trend numbers feed the verdict.
    from pipeline import prices, verdict
    try:
        prices.build(list(zip(df["ticker"], df["market"])))
    except Exception as e:  # noqa: BLE001  (price chart is optional; never block the ranking)
        print("prices failed:", e, file=sys.stderr)
    st = prices.stats(list(df["ticker"]))
    for k in ("ret_12m", "vs_ma200", "pos_52w", "lo_52w", "hi_52w", "spark"):
        df[k] = df["ticker"].map(lambda t, k=k: st.get(t, {}).get(k))
    df = score(df)
    day = dt.datetime.now(dt.timezone(dt.timedelta(hours=-3))).date()
    mac = macro()
    df = verdict.apply(df, mac)
    for mkt in ("BR", "US"):
        print(f"verdicts {mkt}:", df[df["market"] == mkt]["verdict"].value_counts().to_dict())

    recs = to_records(df.sort_values("final_score", ascending=False))
    meta = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "date": day.isoformat(),
        "counts": {"BR": int((df["market"] == "BR").sum()), "US": int((df["market"] == "US").sum())},
        "macro": mac,
        "sources": {"history": "CVM DFP (Brasil) e SEC XBRL (EUA), " + str(fund.get("generated_at", "ainda não coletado")), "BR": "Fundamentus (resultado.php)", "US": "Yahoo Finance via yfinance; S&P 500 list: datasets/s-and-p-500-companies", "macro": "BCB SGS 432/433; US 10y: CBOE ^TNX via Yahoo"},
        "notes": notes,
    }
    (OUT / "series.json").write_text(json.dumps(series, separators=(",", ":")))
    (OUT / "stocks.json").write_text(json.dumps(recs, ensure_ascii=False, separators=(",", ":")))
    (OUT / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    print("wrote", len(recs), "stocks")
    show = ["ticker", "sector", "price", "pe", "pb", "ev_ebit", "dy", "roic", "roe", "value_score", "quality_score", "final_score", "flags"]
    with pd.option_context("display.width", 250, "display.max_columns", 20):
        for mkt in ("BR", "US"):
            part = df[df["market"] == mkt]
            print(f"--- top 12 {mkt} (of {len(part)}); coverage:", {c: int(part[c].notna().sum()) for c in ["pe", "pb", "ev_ebit", "dy", "roic", "net_debt_ebitda", "current_ratio"]})
            print(part.sort_values("final_score", ascending=False)[show].head(12).to_string(index=False))
            fc = pd.Series([f for fs in part["flags"] for f in fs]).value_counts().to_dict()
            print(f"flags {mkt}:", fc, "| graham defensive pass:", int(part["graham_pass"].sum()),
                  "| median coverage:", part["coverage"].median(), "| median pe_avg3:", part["pe_avg3"].median())
    save_neon(df, mac, day, "; ".join(notes))
    if not (OUT / "history.json").exists():
        (OUT / "history.json").write_text("{}")


if __name__ == "__main__":
    main()
