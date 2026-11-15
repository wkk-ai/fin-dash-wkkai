"""Tesouro Direto 'na curva' value: what each bond is worth if it keeps
yielding the rate it was bought at (no mark-to-market).

Inputs: the bond purchases (FinTrack's bond_purchases table, passed in as a dict) and data/ipca.txt
(IBGE IPCA index, YYYYMM;value). refresh_ipca() updates ipca.txt from IBGE.
Pure Python (no numpy) so it also runs in the browser.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import re
from functools import lru_cache
from typing import Dict, List, Optional

import bisect

from .engine import bond_key

DATA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
IPCA_FILE = os.path.join(DATA, "ipca.txt")
PURCHASES_FILE = os.path.join(DATA, "bond_purchases.json")
BASE = 1614.62  # IPCA index jun/2000 -> VNA 1000 on 15/07/2000
PROJ = 0.0025   # monthly IPCA assumed for months IBGE has not published yet

KIND_FAMILY = {"princ": "princ", "ntnb": "ntnb", "ntnf": "pre-juros", "rendaplus": "b1", "ltn": "pre"}


# ---------- IPCA ----------
@lru_cache(None)
def _ipca() -> Dict[int, float]:
    out = {}
    with open(IPCA_FILE) as fh:
        for line in fh:
            if ";" in line:
                k, v = line.strip().split(";")
                out[int(k)] = float(v)
    return out


def refresh_ipca(timeout: float = 15) -> bool:
    """Pull the IPCA index from IBGE (SIDRA table 1737, variable 2266). True if updated."""
    import urllib.request
    url = "https://apisidra.ibge.gov.br/values/t/1737/n1/all/v/2266/p/201812-209912"
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            rows = json.loads(r.read().decode())
        lines = [f"{x['D3C']};{x['V']}" for x in rows[1:] if x.get("V") not in (None, "", "...", "-")]
        if len(lines) < 12:
            return False
        with open(IPCA_FILE, "w") as fh:
            fh.write("\n".join(lines) + "\n")
        _ipca.cache_clear()
        return True
    except Exception:
        return False


# ---------- calendar ----------
def _easter(y):
    a = y % 19; b = y // 100; c = y % 100; d = b // 4; e = b % 4; f = (b + 8) // 25; g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30; i = c // 4; k = c % 4; l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451; mo = (h + l - 7 * m + 114) // 31; da = ((h + l - 7 * m + 114) % 31) + 1
    return dt.date(y, mo, da)


@lru_cache(None)
def _holidays():
    hs = set()
    for y in range(2000, 2100):
        e = _easter(y)
        fixed = [(1, 1), (4, 21), (5, 1), (9, 7), (10, 12), (11, 2), (11, 15), (12, 25)] + ([(11, 20)] if y >= 2024 else [])
        hs.update(dt.date(y, m, d) for m, d in fixed)
        hs.update([e - dt.timedelta(48), e - dt.timedelta(47), e - dt.timedelta(2), e + dt.timedelta(60)])
    return hs


_START = dt.date(2000, 1, 1).toordinal()
_END = dt.date(2100, 1, 1).toordinal()


@lru_cache(None)
def _bd_prefix():
    """_bd_prefix()[i] = business days in [2000-01-01, that day + i), so any count is one subtraction."""
    hol = _holidays()
    out, n = [0], 0
    for o in range(_START, _END):
        d = dt.date.fromordinal(o)
        if d.weekday() < 5 and d not in hol:
            n += 1
        out.append(n)
    return out


def _is_busday(d: dt.date) -> bool:
    return d.weekday() < 5 and d not in _holidays()


def du(a, b) -> int:
    """Business days from a (included) to b (excluded); negative if b < a. Same as numpy.busday_count."""
    p = _bd_prefix()
    at = lambda d, k=0: p[min(max(d.toordinal() - _START + k, 0), len(p) - 1)]  # noqa: E731
    if b >= a:
        return at(b) - at(a)
    return -(at(a, 1) - at(b, 1))   # numpy counts (b, a] when the dates are reversed


def last_business_day(year: int, month: int) -> dt.date:
    d = dt.date(year + (month == 12), month % 12 + 1, 1) - dt.timedelta(1)
    while not _is_busday(d):
        d -= dt.timedelta(1)
    return d


def _add_months(y, m, k):
    t = y * 12 + (m - 1) + k
    return t // 12, t % 12 + 1


def _idx(y, m):
    ip = _ipca()
    if y * 100 + m in ip:
        return ip[y * 100 + m]
    py, pm = _add_months(y, m, -1)
    return _idx(py, pm) * (1 + PROJ)


def vna(d: dt.date) -> float:
    y, m = (d.year, d.month) if d.day >= 15 else _add_months(d.year, d.month, -1)
    p = dt.date(y, m, 15); ny, nm = _add_months(y, m, 1); n = dt.date(ny, nm, 15)
    py, pm = _add_months(y, m, -1)
    v0 = 1000 * _idx(py, pm) / BASE; v1 = 1000 * _idx(y, m) / BASE
    return v0 * (v1 / v0) ** (du(p, d) / du(p, n))


# ---------- pricing ----------
def _flows(kind, mat, start):
    out = []
    if kind in ("princ", "ltn"):
        out = [(mat, 1.0 if kind == "princ" else 1000.0)]
    elif kind in ("ntnb", "ntnf"):
        c = (1.06 ** 0.5 - 1) if kind == "ntnb" else (1.10 ** 0.5 - 1) * 1000
        y, m = mat.year, mat.month; d = mat
        while d > start:
            out.append((d, c)); y, m = _add_months(y, m, -6); d = dt.date(y, m, mat.day)
        out.sort(); out[-1] = (out[-1][0], out[-1][1] + (1.0 if kind == "ntnb" else 1000.0))
    elif kind == "rendaplus":  # 240 monthly payments ending at maturity (15/12)
        y0 = mat.year - 19
        out = [(dt.date(y0 + (k // 12), k % 12 + 1, 15), 1.0 / 240) for k in range(240)]
    return [(d, a) for d, a in out if d > start]


def pu(kind, mat, d, r) -> float:
    pv = sum(a / (1 + r) ** (du(d, t) / 252) for t, a in _flows(kind, mat, d))
    return pv if kind in ("ntnf", "ltn") else vna(d) * pv


def solve_rate(kind, mat, d, price) -> float:
    lo, hi = -0.05, 0.40
    for _ in range(200):
        mid = (lo + hi) / 2
        if pu(kind, mat, d, mid) > price:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


# ---------- portfolio ----------
def _date(s):
    return dt.date.fromisoformat(s)


def from_rows(rows: List[dict]) -> dict:
    """Build the purchase book from FinTrack's bond_purchases rows."""
    p: dict = {"bonds": {}, "purchases": []}
    for r in rows or []:
        code = str(r.get("bond_code") or "")
        if not code or r.get("kind") not in KIND_FAMILY:
            continue
        p["bonds"].setdefault(code, {"institution": r.get("institution") or "", "name": r.get("bond_name") or "",
                                     "kind": r["kind"], "maturity": str(r["maturity"])[:10]})
        p["purchases"].append({"bond": code, "date": str(r["purchase_date"])[:10], "qty": float(r["quantity"]),
                               "unit_price": float(r["unit_price"])})
    return p


def load(src=PURCHASES_FILE) -> dict:
    """src: a dict (see from_rows) or the path of a bond_purchases.json file."""
    if isinstance(src, dict):
        p = json.loads(json.dumps(src))
    else:
        with open(src) as fh:
            p = json.load(fh)
    for b in p["bonds"].values():
        b["mat"] = _date(b["maturity"])
    for x in p["purchases"]:
        b = p["bonds"][x["bond"]]
        x["d"] = _date(x["date"])
        x["rate"] = solve_rate(b["kind"], b["mat"], x["d"], x["unit_price"])
    return p


def bond_value(p: dict, code: str, on: dt.date) -> Optional[float]:
    """Curve value of everything held in one bond on a date. None if nothing held."""
    b = p["bonds"][code]
    if b["mat"] <= on:
        return None
    lots = [x for x in p["purchases"] if x["bond"] == code and x["d"] <= on]
    if not lots:
        return None
    return round(sum(x["qty"] * pu(b["kind"], b["mat"], on, x["rate"]) for x in lots), 2)


def match_bond(p: dict, institution: str, asset: str) -> Optional[str]:
    """Which purchased bond a dashboard row is, by institution + family + year."""
    key = bond_key(asset)
    inst = (institution or "").strip().lower()
    cands = {c: b for c, b in p["bonds"].items() if b["institution"].lower() == inst}
    if not cands:
        return None
    if not key:  # e.g. "Tesouro Pre 2035": bond, but family unclear
        m = re.search(r"tesouro.*?(20\d{2})", asset or "", re.I)
        if not m:
            return None
        key = ("?", m.group(1))
    fam, year = key
    exact = [c for c, b in cands.items() if KIND_FAMILY[b["kind"]] == fam and
             (str(b.get("year", b["mat"].year)) == year or (b["kind"] == "rendaplus" and fam == "b1"))]
    if len(exact) == 1:
        return exact[0]
    # Old names ("Tesouro IPCA 2060", "Tesouro Pre 2035"): unique bond of that year.
    same_year = [c for c, b in cands.items() if str(b.get("year", b["mat"].year)) == year]
    return same_year[0] if len(same_year) == 1 else None


def is_aggregate(asset: str) -> bool:
    return (asset or "").strip().lower() == "tesouro direto"


def aggregate_value(p: dict, institution: str, on: dt.date) -> Optional[float]:
    """Curve value of all Tesouro Direto bonds at one institution (old summed rows)."""
    vals = [bond_value(p, c, on) for c, b in p["bonds"].items()
            if b["institution"].lower() == institution.strip().lower() and b.get("channel") != "renda_fixa"]
    vals = [v for v in vals if v is not None]
    return round(sum(vals), 2) if vals else None


def curve_for_row(p: dict, institution: str, asset: str, on: dt.date) -> Optional[float]:
    if is_aggregate(asset):
        return aggregate_value(p, institution, on)
    code = match_bond(p, institution, asset)
    return bond_value(p, code, on) if code else None
