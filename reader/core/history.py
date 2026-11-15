"""Memory on disk: what every past month looked like, plus the user's settings.

Everything lives in one folder (default ~/.financial-reader). Writes are atomic,
and a damaged file is set aside instead of crashing the app.
"""
from __future__ import annotations

import csv
import io
import json
import os
import re
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
MONTHS_PT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro",
             "novembro", "dezembro"]
CSV_COLS = ["Date", "Classification", "Institution", "Asset", "Value", "ValueCurve"]
DEFAULT_SETTINGS = {
    "manual": [],
    "folder": "",
}


def dash_date(d: date) -> str:
    return f"01/{MONTHS_EN[d.month - 1]}/{d.year % 100:02d}"


def parse_dash_date(s: str) -> Optional[date]:
    m = re.match(r"^\s*(\d{1,2})/([A-Za-z]{3})/(\d{2,4})\s*$", s or "")
    if not m:
        return None
    try:
        mo = [x.lower() for x in MONTHS_EN].index(m.group(2).lower()) + 1
    except ValueError:
        return None
    y = int(m.group(3))
    return date(y + 2000 if y < 100 else y, mo, 1)


def month_label(d: date) -> str:
    return f"{MONTHS_PT[d.month - 1]} de {d.year}"


def default_month(today: date) -> date:
    """Prints taken up to the 14th belong to the month that just closed."""
    if today.day >= 15:
        return date(today.year, today.month, 1)
    return date(today.year - (today.month == 1), (today.month - 2) % 12 + 1, 1)


def _atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)


def _read_json(path: Path, default):
    if not path.is_file():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        try:
            os.replace(path, path.with_suffix(path.suffix + f".quebrado-{datetime.now():%Y%m%d%H%M%S}"))
        except OSError:
            pass
        return default


def rows_from_csv(text: str) -> List[Dict[str, Any]]:
    """Read a dashboard CSV (any of its header spellings). Bad lines are skipped."""
    rows: List[Dict[str, Any]] = []
    try:
        reader = csv.DictReader(io.StringIO(text.lstrip("﻿")))
        for raw in reader:
            low = {(k or "").strip().lower(): (v or "").strip() for k, v in raw.items()}
            try:
                val = float(low.get("value", "").replace(",", ".")) if low.get("value") else None
            except ValueError:
                val = None
            if val is None or not (low.get("asset") or low.get("institution")):
                continue
            rows.append({"Date": low.get("date", ""), "Classification": low.get("classification", ""),
                         "Institution": low.get("institution", ""), "Asset": low.get("asset", ""), "Value": round(val, 2)})
    except Exception:
        return rows
    return rows


def rows_to_csv(rows: List[Dict[str, Any]]) -> str:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=CSV_COLS, extrasaction="ignore", lineterminator="\n")
    w.writeheader()
    for r in rows:
        w.writerow({"Date": r.get("Date", ""), "Classification": r.get("Classification", ""),
                    "Institution": r.get("Institution", ""), "Asset": r.get("Asset", ""),
                    "Value": f"{float(r.get('Value') or 0):.2f}",
                    "ValueCurve": "" if r.get("ValueCurve") in (None, "") else f"{float(r['ValueCurve']):.2f}"})
    return buf.getvalue()


class Store:
    def __init__(self, root: Optional[Path] = None, seed_dir: Optional[Path] = None):
        self.root = Path(root or os.environ.get("FR_DATA_DIR") or (Path.home() / ".financial-reader"))
        self.root.mkdir(parents=True, exist_ok=True)
        self.months_dir = self.root / "meses"
        self.months_dir.mkdir(exist_ok=True)
        self._seed(seed_dir)

    # ---- months
    def _month_path(self, d: date) -> Path:
        return self.months_dir / f"{d.year:04d}-{d.month:02d}.json"

    def save_month(self, d: date, rows: List[Dict[str, Any]], source: str = "app") -> None:
        clean = [r for r in rows if r.get("Asset") and r.get("Institution")]
        _atomic_write(self._month_path(d), json.dumps(
            {"date": dash_date(d), "saved_at": datetime.now().isoformat(timespec="seconds"), "source": source,
             "rows": clean}, ensure_ascii=False, indent=1))

    def load_month(self, d: date) -> List[Dict[str, Any]]:
        data = _read_json(self._month_path(d), {})
        rows = data.get("rows") if isinstance(data, dict) else None
        return [r for r in rows if isinstance(r, dict)] if isinstance(rows, list) else []

    def months(self) -> List[date]:
        out = []
        for p in self.months_dir.glob("????-??.json"):
            try:
                out.append(date(int(p.stem[:4]), int(p.stem[5:7]), 1))
            except ValueError:
                continue
        return sorted(out)

    def previous(self, d: date) -> Tuple[Optional[date], List[Dict[str, Any]]]:
        """Most recent saved month before d (not necessarily the one right before)."""
        for m in reversed(self.months()):
            if m < d:
                rows = self.load_month(m)
                if rows:
                    return m, rows
        return None, []

    def totals(self) -> List[Dict[str, Any]]:
        return [{"date": dash_date(m), "iso": m.isoformat(), "label": month_label(m),
                 "total": round(sum(float(r.get("Value") or 0) for r in self.load_month(m)), 2)} for m in self.months()]

    def import_csv(self, text: str) -> List[date]:
        """Load months from a dashboard CSV. Existing months saved by the app are kept."""
        by_month: Dict[date, List[Dict[str, Any]]] = {}
        for r in rows_from_csv(text):
            d = parse_dash_date(r.get("Date", ""))
            if d:
                by_month.setdefault(d, []).append(r)
        done = []
        for d, rows in by_month.items():
            cur = _read_json(self._month_path(d), {})
            if isinstance(cur, dict) and cur.get("source") == "app" and cur.get("rows"):
                continue
            self.save_month(d, rows, source="csv")
            done.append(d)
        return sorted(done)

    def _seed(self, seed_dir: Optional[Path]) -> None:
        """First run: bring in the months that came with the app and the old last_month.csv."""
        marker = self.root / "seeded.json"
        seen = set(_read_json(marker, []) or [])
        files: List[Path] = []
        if seed_dir and Path(seed_dir).is_dir():
            files += sorted(Path(seed_dir).glob("*.csv"))
        old = self.root / "last_month.csv"
        if old.is_file():
            files.append(old)
        changed = False
        for f in files:
            tag = f"{f.name}:{f.stat().st_size}"
            if tag in seen:
                continue
            try:
                self.import_csv(f.read_text(encoding="utf-8"))
            except Exception:
                pass
            seen.add(tag)
            changed = True
        if changed:
            _atomic_write(marker, json.dumps(sorted(seen)))

    # ---- settings / working session
    def settings(self) -> Dict[str, Any]:
        s = _read_json(self.root / "settings.json", {})
        out = json.loads(json.dumps(DEFAULT_SETTINGS))
        if isinstance(s, dict):
            out.update({k: v for k, v in s.items() if k in out})
        if not isinstance(out.get("manual"), list):
            out["manual"] = DEFAULT_SETTINGS["manual"]
        return out

    def save_settings(self, s: Dict[str, Any]) -> None:
        _atomic_write(self.root / "settings.json", json.dumps(s, ensure_ascii=False, indent=1))

    def load_session(self) -> Dict[str, Any]:
        s = _read_json(self.root / "sessao.json", {})
        return s if isinstance(s, dict) else {}

    def save_session(self, s: Dict[str, Any]) -> None:
        _atomic_write(self.root / "sessao.json", json.dumps(s, ensure_ascii=False))
