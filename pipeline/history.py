"""Multi-year fundamentals from official filings. Runs weekly; output is committed to the repo.

Brazil: CVM open data, DFP annual statements (consolidated), mapped to B3 tickers through the FCA register.
US: SEC XBRL "frames" API (one request per concept per year for all filers), mapped to tickers by CIK.

Output: pipeline/data/fundamentals.json
  {"generated_at": ..., "BR": {ticker: {year: {field: value}}}, "US": {...}}
Fields (all in currency units, annual): rev, ebit, ni, int_exp (positive number), fin_inc (BR financial income), cfo, div (paid, positive),
ca, cl (current assets/liabilities), eq (equity), ltd (long-term debt), eps (US only).

Usage: python -m pipeline.history [--years 12] [--skip-br] [--skip-us]
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import json
import re
import sys
import time
import unicodedata
import zipfile
from pathlib import Path

import requests

OUT = Path(__file__).resolve().parent / "data" / "fundamentals.json"
CVM = "https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC"
import os
# SEC requires a real contact e-mail in the User-Agent; set repository secret SEC_CONTACT_EMAIL to enable 12-year US history.
SEC_UA = {"User-Agent": f"stock-picker {os.environ.get('SEC_CONTACT_EMAIL', 'github-actions@users.noreply.github.com')}", "Accept-Encoding": "gzip, deflate"}
BROWSER_UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"}


def fold(s: str) -> str:
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()


def get(url: str, headers: dict, tries: int = 4, timeout: int = 120) -> requests.Response | None:
    for i in range(tries):
        try:
            r = requests.get(url, headers=headers, timeout=timeout)
            if r.status_code == 200:
                return r
            if r.status_code == 404:
                return None
            print(f"  {r.status_code} {url}", file=sys.stderr)
        except requests.RequestException as e:
            print(f"  error {url}: {e}", file=sys.stderr)
        time.sleep(3 * (i + 1))
    return None


# ----------------------------------------------------------------------------- Brazil (CVM)

def _num(v: str) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def br_ticker_map(year: int) -> dict[str, list[str]]:
    """CNPJ -> list of tickers, from the FCA securities file (latest year available)."""
    for y in range(year, year - 3, -1):
        r = get(f"{CVM}/FCA/DADOS/fca_cia_aberta_{y}.zip", BROWSER_UA)
        if not r:
            continue
        z = zipfile.ZipFile(io.BytesIO(r.content))
        name = next((n for n in z.namelist() if "valor_mobiliario" in n), None)
        if not name:
            continue
        out: dict[str, set] = {}
        with z.open(name) as f:
            for row in csv.DictReader(io.TextIOWrapper(f, encoding="latin-1"), delimiter=";"):
                tk = (row.get("Codigo_Negociacao") or "").strip().upper()
                cnpj = (row.get("CNPJ_Companhia") or "").strip()
                if re.fullmatch(r"[A-Z0-9]{4}\d{1,2}", tk) and cnpj:
                    out.setdefault(cnpj, set()).add(tk)
        print(f"FCA {y}: {sum(len(v) for v in out.values())} tickers, {len(out)} companies")
        return {k: sorted(v) for k, v in out.items()}
    return {}


def _rows(z: zipfile.ZipFile, kind: str):
    """Latest version, current fiscal year rows of a consolidated statement file."""
    name = next((n for n in z.namelist() if f"_{kind}_con_" in n), None)
    if not name:
        return
    best: dict[str, str] = {}
    rows = []
    with z.open(name) as f:
        for row in csv.DictReader(io.TextIOWrapper(f, encoding="latin-1"), delimiter=";"):
            if fold(row.get("ORDEM_EXERC", "")).startswith("ultimo"):
                rows.append(row)
                c = row["CNPJ_CIA"]
                if row.get("VERSAO", "0") > best.get(c, ""):
                    best[c] = row.get("VERSAO", "0")
    for row in rows:
        if row.get("VERSAO", "0") == best[row["CNPJ_CIA"]]:
            yield row


def br_year(year: int) -> dict[str, dict]:
    r = get(f"{CVM}/DFP/DADOS/dfp_cia_aberta_{year}.zip", BROWSER_UA, timeout=300)
    if not r:
        print(f"DFP {year}: not available")
        return {}
    z = zipfile.ZipFile(io.BytesIO(r.content))
    data: dict[str, dict] = {}

    def put(cnpj, key, val, scale):
        if val is None:
            return
        data.setdefault(cnpj, {})[key] = val * scale

    def add(cnpj, key, val, scale):
        if val is None:
            return
        d = data.setdefault(cnpj, {})
        d[key] = d.get(key, 0.0) + val * scale

    for kind in ("DRE", "BPA", "BPP", "DFC_MI", "DFC_MD"):
        for row in _rows(z, kind):
            cnpj, code, ds = row["CNPJ_CIA"], row["CD_CONTA"], fold(row.get("DS_CONTA", ""))
            scale = 1000.0 if fold(row.get("ESCALA_MOEDA", "")) == "mil" else 1.0
            v = _num(row.get("VL_CONTA"))
            if kind == "DRE":
                if code == "3.01":
                    put(cnpj, "rev", v, scale)
                elif code == "3.05" and "antes do resultado financeiro" in ds:
                    put(cnpj, "ebit", v, scale)
                elif code == "3.06.01" and "receita" in ds:
                    put(cnpj, "fin_inc", abs(v) if v is not None else None, scale)
                elif code == "3.06.02" and "despesa" in ds:
                    put(cnpj, "int_exp", abs(v) if v is not None else None, scale)
                elif code == "3.11" and "lucro" in ds:
                    put(cnpj, "ni", v, scale)
                elif code == "3.09" and "lucro" in ds and "ni" not in data.get(cnpj, {}):
                    put(cnpj, "ni_alt", v, scale)
            elif kind == "BPA" and code == "1.01":
                put(cnpj, "ca", v, scale)
            elif kind == "BPP":
                if code == "2.01":
                    put(cnpj, "cl", v, scale)
                elif code == "2.03" and "patrimonio" in ds:
                    put(cnpj, "eq", v, scale)
                elif code == "2.02.01" and "emprestimo" in ds:
                    put(cnpj, "ltd", v, scale)
            elif kind.startswith("DFC"):
                if code == "6.01":
                    put(cnpj, "cfo", v, scale)
                elif code.startswith("6.03.") and code.count(".") == 2 and re.search(r"dividend|juros sobre (o )?capital|jcp", ds):
                    if v is not None and v < 0:
                        add(cnpj, "div", abs(v), scale)
    for d in data.values():
        if "ni" not in d and "ni_alt" in d:
            d["ni"] = d["ni_alt"]
        d.pop("ni_alt", None)
    print(f"DFP {year}: {len(data)} companies")
    return data


def build_br(years: list[int]) -> dict:
    tmap = br_ticker_map(years[-1] + 1)
    out: dict[str, dict] = {}
    for y in years:
        for cnpj, vals in br_year(y).items():
            for tk in tmap.get(cnpj, []):
                out.setdefault(tk, {})[str(y)] = {k: round(v, 2) for k, v in vals.items()}
    return out


# ----------------------------------------------------------------------------- US (SEC frames)

DURATION = {
    "rev": ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet"],
    "ebit": ["OperatingIncomeLoss"],
    "ni": ["NetIncomeLoss"],
    "int_exp": ["InterestExpense", "InterestExpenseNonoperating", "InterestExpenseDebt"],
    "cfo": ["NetCashProvidedByUsedInOperatingActivities"],
    "div": ["PaymentsOfDividends", "PaymentsOfDividendsCommonStock"],
}
INSTANT = {
    "ca": ["AssetsCurrent"],
    "cl": ["LiabilitiesCurrent"],
    "eq": ["StockholdersEquity"],
    "ltd": ["LongTermDebtNoncurrent", "LongTermDebt"],
}


_SEC_FAILS = {"n": 0, "ok": 0}


def _frame(concept: str, period: str, unit: str = "USD") -> dict[int, float]:
    if _SEC_FAILS["ok"] == 0 and _SEC_FAILS["n"] >= 3:
        return {}  # SEC refusing this runner: stop early instead of retrying ~200 requests
    r = get(f"https://data.sec.gov/api/xbrl/frames/us-gaap/{concept}/{unit}/{period}.json", SEC_UA, tries=2)
    _SEC_FAILS["ok" if r else "n"] += 1
    time.sleep(0.15)  # SEC fair-access: max 10 requests/second
    if not r:
        return {}
    return {int(d["cik"]): float(d["val"]) for d in r.json().get("data", [])}


def build_us(years: list[int]) -> dict:
    # CIK -> ticker from the public S&P 500 constituents list (www.sec.gov blocks some cloud IPs).
    r = get("https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv", {})
    if not r:
        print("S&P 500 list unavailable", file=sys.stderr)
        return {}
    cik_tk: dict[int, str] = {}
    for row in csv.DictReader(io.StringIO(r.text)):
        try:
            cik_tk[int(row["CIK"])] = row["Symbol"].strip().upper()
        except (KeyError, ValueError):
            continue
    print(f"S&P 500 CIKs: {len(cik_tk)}")
    out: dict[str, dict] = {}

    def store(vals: dict[int, float], year: int, key: str, absval: bool = False):
        for cik, v in vals.items():
            tk = cik_tk.get(cik)
            if not tk:
                continue
            row = out.setdefault(tk, {}).setdefault(str(year), {})
            if key not in row:  # first concept in the list wins
                row[key] = round(abs(v) if absval else v, 2)

    for y in years:
        for key, concepts in DURATION.items():
            for c in concepts:
                store(_frame(c, f"CY{y}"), y, key, absval=key in ("int_exp", "div"))
        for key, concepts in INSTANT.items():
            for c in concepts:
                store(_frame(c, f"CY{y}Q4I"), y, key)
        store(_frame("EarningsPerShareDiluted", f"CY{y}", "USD-per-shares"), y, "eps")
        print(f"SEC {y}: {sum(1 for t in out.values() if str(y) in t)} tickers")
    return out


YF_ROWS = {
    "rev": ["Total Revenue", "Operating Revenue"],
    "ebit": ["Operating Income", "EBIT"],
    "ni": ["Net Income", "Net Income Common Stockholders"],
    "int_exp": ["Interest Expense", "Interest Expense Non Operating"],
    "eps": ["Diluted EPS"],
}
YF_CF = {"cfo": ["Operating Cash Flow"], "div": ["Cash Dividends Paid", "Common Stock Dividend Paid"]}
YF_BS = {"ca": ["Current Assets"], "cl": ["Current Liabilities"], "eq": ["Stockholders Equity"], "ltd": ["Long Term Debt"]}


def build_us_yahoo(tickers: list[str]) -> dict:
    """Fallback when SEC refuses the runner: Yahoo annual statements (about 4 years)."""
    import yfinance as yf

    out: dict[str, dict] = {}
    for i, tk in enumerate(tickers):
        try:
            t = yf.Ticker(tk.replace(".", "-"))
            frames = [(t.income_stmt, YF_ROWS), (t.cashflow, YF_CF), (t.balance_sheet, YF_BS)]
        except Exception as e:  # noqa: BLE001
            print(f"  yahoo {tk}: {e}", file=sys.stderr)
            continue
        row_out: dict[str, dict] = {}
        for df, spec in frames:
            if df is None or getattr(df, "empty", True):
                continue
            for col in df.columns:
                y = str(getattr(col, "year", col))[:4]
                for key, names in spec.items():
                    for n in names:
                        if n in df.index:
                            v = df.at[n, col]
                            try:
                                v = float(v)
                            except (TypeError, ValueError):
                                continue
                            if v != v:
                                continue
                            if key in ("int_exp", "div"):
                                v = abs(v)
                            row_out.setdefault(y, {}).setdefault(key, round(v, 2))
                            break
        if row_out:
            out[tk] = row_out
        time.sleep(0.3)
        if i % 100 == 0:
            print(f"yahoo {i}/{len(tickers)}")
    print(f"Yahoo statements: {len(out)} tickers")
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", type=int, default=12)
    ap.add_argument("--skip-br", action="store_true")
    ap.add_argument("--skip-us", action="store_true")
    a = ap.parse_args()
    this_year = dt.date.today().year
    years = list(range(this_year - a.years, this_year))  # last complete fiscal years

    old = json.loads(OUT.read_text()) if OUT.exists() else {}
    res = {"generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "years": [str(y) for y in years]}
    res["BR"] = old.get("BR", {}) if a.skip_br else build_br(years)
    res["US"] = old.get("US", {}) if a.skip_us else build_us(years)
    old_us = old.get("US", {})
    old_deep = sum(1 for h in old_us.values() if len(h) >= 8)
    if not a.skip_us and len(res["US"]) < 100 and old_deep >= 100:
        print("SEC data missing; keeping previous multi-year US data", file=sys.stderr)
        res["US"] = old_us
        res["US_source"] = old.get("US_source")
    elif not a.skip_us and len(res["US"]) < 100:
        print("SEC data missing; falling back to Yahoo annual statements", file=sys.stderr)
        r = get("https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv", {})
        tks = [row["Symbol"].strip().upper() for row in csv.DictReader(io.StringIO(r.text))] if r else []
        res["US"] = build_us_yahoo(tks)
        res["US_source"] = "Yahoo (4 anos)"
    for m in ("BR", "US"):
        n = len(res[m])
        if n == 0 and old.get(m):
            print(f"{m}: empty result, keeping previous data", file=sys.stderr)
            res[m] = old[m]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(res, separators=(",", ":"), sort_keys=True))
    print(f"wrote {OUT} BR={len(res['BR'])} US={len(res['US'])} ({OUT.stat().st_size / 1e6:.1f} MB)")
    for tk in ("PETR4", "WEGE3", "ITUB4", "AAPL", "JPM"):
        m = "BR" if tk[-1].isdigit() else "US"
        h = res[m].get(tk, {})
        last = max(h) if h else None
        print(" check", tk, last, h.get(last) if last else None)


if __name__ == "__main__":
    main()
