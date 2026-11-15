"""The print reader inside FinTrack: the same engine as the Mac app, run in the browser by Pyodide.

The browser reads the text of each print (Tesseract) and hands the reading here; the prints themselves
never reach Python or any server. Every call returns JSON text. State lives in /fr, which the page keeps
in the browser's storage between visits.
"""
from __future__ import annotations

import json
import re
import shutil
from datetime import date
from pathlib import Path
from typing import Any, Dict, Optional

from core.engine import CLASSES, _hid, analyse
from core.history import Store, dash_date, parse_dash_date
from core.screens import INSTITUTIONS
from core.vision import Page

ROOT = Path("/fr")


def safe_name(name: str) -> str:
    name = str(name or "").replace("\\", "/").split("/")[-1].strip() or "imagem.png"
    return re.sub(r"[^\w.\- ()+]", "_", name)[:120]


def parse_money(v: Any) -> Optional[float]:
    """'1.234,56', 'R$ 1.234,56', '1234.56', 1234.56 -> 1234.56. None if it is not a number."""
    if isinstance(v, (int, float)):
        return round(float(v), 2) if abs(v) < 1e12 else None
    s = re.sub(r"[^\d,.\-]", "", str(v or ""))
    if not re.search(r"\d", s):
        return None
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    elif re.fullmatch(r"-?\d{1,3}(\.\d{3})+", s):
        s = s.replace(".", "")
    try:
        f = round(float(s), 2)
    except ValueError:
        return None
    return f if abs(f) < 1e12 else None


class App:
    def __init__(self) -> None:
        self.store = Store(root=ROOT)
        s = self.store.load_session()
        self.pages: Dict[str, Page] = {}
        for d in s.get("pages") or []:
            try:
                p = Page.from_dict(d)
                self.pages[p.name] = p
            except Exception:
                continue
        self.overrides: Dict[str, Any] = s.get("overrides") if isinstance(s.get("overrides"), dict) else {}
        self.month: str = s.get("month") or ""
        self.saved_month: str = s.get("saved_month") or ""

    def persist(self) -> None:
        self.store.save_session({"pages": [p.to_dict() for p in self.pages.values()], "overrides": self.overrides,
                                 "month": self.month, "saved_month": self.saved_month})

    def _month(self) -> Optional[date]:
        try:
            return date.fromisoformat(self.month + "-01") if self.month else None
        except ValueError:
            return None

    # ---- what FinTrack already has
    def load_history(self, rows: list) -> None:
        """Replace the saved months with the ones in FinTrack (the source of truth)."""
        by_month: Dict[date, list] = {}
        for r in rows or []:
            d = parse_dash_date(str(r.get("Date") or ""))
            if d and r.get("Asset") and r.get("Institution"):
                by_month.setdefault(date(d.year, d.month, 1), []).append({
                    "Date": dash_date(d), "Classification": r.get("Classification") or "",
                    "Institution": r["Institution"], "Asset": r["Asset"], "Value": float(r.get("Value") or 0)})
        shutil.rmtree(self.store.months_dir, ignore_errors=True)
        self.store.months_dir.mkdir(parents=True, exist_ok=True)
        for m, rs in by_month.items():
            self.store.save_month(m, rs, source="fintrack")

    def set_settings(self, s: dict) -> None:
        if isinstance(s, dict) and s:
            cur = self.store.settings()
            cur.update({k: v for k, v in s.items() if k in cur})
            self.store.save_settings(cur)

    # ---- the answer
    def result(self) -> Dict[str, Any]:
        month = self._month()
        pages = list(self.pages.values())
        settings = self.store.settings()
        res = analyse(pages, overrides=self.overrides, settings=settings, month=month)
        m = date.fromisoformat(res["month"])
        prev_date, prev_rows = self.store.previous(m)
        res = analyse(pages, overrides=self.overrides, prev_rows=prev_rows, prev_date=prev_date, settings=settings, month=m)
        res["history"] = self.store.totals()
        res["manual"] = settings.get("manual") or []
        res["settings"] = settings
        res["institutions"] = INSTITUTIONS
        res["classes"] = CLASSES
        res["saved"] = self.saved_month == res["month"] and bool(pages)
        res["month_exists"] = m in self.store.months()
        res["month_fixed"] = bool(self.month)
        return res

    # ---- prints
    def add_page(self, name: str, reading: dict) -> Dict[str, Any]:
        name = safe_name(name)
        page = Page.from_dict(dict(reading or {}, name=name))
        if not page.tokens and not page.error:
            page.error = "Nenhum texto encontrado na imagem"
        self.pages[name] = page
        self.saved_month = ""
        self.persist()
        return {"ok": not page.error, "name": name, "error": page.error}

    def clear(self) -> None:
        self.pages, self.overrides, self.month, self.saved_month = {}, {}, "", ""
        self.persist()

    # ---- user actions (same as the Mac app)
    def action(self, a: Dict[str, Any]) -> None:
        t = a.get("type")
        rows = self.overrides.setdefault("rows", {})
        prints = self.overrides.setdefault("prints", {})
        if t == "set_row":
            cur = rows.setdefault(str(a["id"]), {})
            if "Value" in a:
                v = parse_money(a["Value"])
                if v is None:
                    raise ValueError("Valor inválido. Use o formato 1.234,56.")
                cur["Value"] = v
            for k in ("Asset", "Classification", "Institution"):
                if isinstance(a.get(k), str) and a[k].strip():
                    cur[k] = a[k].strip()[:120]
            for k in ("confirmed", "excluded"):
                if k in a:
                    cur[k] = bool(a[k])
        elif t == "reset_row":
            rows.pop(str(a["id"]), None)
        elif t == "print":
            cur = prints.setdefault(safe_name(a["name"]), {})
            if "ignore" in a:
                cur["ignore"] = bool(a["ignore"])
            if "inst" in a:
                cur["inst"] = str(a["inst"])[:60]
            if "manual" in a:
                out = []
                for m in a["manual"] or []:
                    v = parse_money(m.get("Value"))
                    if v is None or not str(m.get("Asset") or "").strip() or not str(m.get("Institution") or "").strip():
                        raise ValueError("Preencha banco, nome e valor.")
                    out.append({"Institution": str(m["Institution"]).strip()[:60], "Asset": str(m["Asset"]).strip()[:120],
                                "Classification": m.get("Classification") if m.get("Classification") in CLASSES else "Renda Fixa",
                                "Value": v, "box": m.get("box")})
                cur["manual"] = out
        elif t == "remove_print":
            name = safe_name(a["name"])
            self.pages.pop(name, None)
            prints.pop(name, None)
        elif t == "add_extra":
            v = parse_money(a.get("Value"))
            if v is None or not a.get("key"):
                raise ValueError("Valor inválido.")
            self.overrides.setdefault("extras", {})[str(a["key"])] = {"Value": v, "Asset": "Saldo em conta"}
        elif t == "dismiss":
            self.overrides.setdefault("dismissed", {})[str(a["key"])] = True
        elif t == "set_month":
            m = str(a.get("month") or "")
            if m and not re.match(r"^\d{4}-\d{2}$", m):
                raise ValueError("Mês inválido.")
            self.month = m
        elif t == "add_manual":
            v = parse_money(a.get("Value"))
            inst, asset = str(a.get("Institution") or "").strip()[:60], str(a.get("Asset") or "").strip()[:120]
            if not inst or not asset or v is None:
                raise ValueError("Preencha banco, nome e valor.")
            s = self.store.settings()
            if not any(m.get("Institution") == inst and m.get("Asset") == asset for m in s["manual"]):
                s["manual"].append({"Institution": inst, "Asset": asset,
                                    "Classification": a.get("Classification") if a.get("Classification") in CLASSES else "Renda Fixa",
                                    "monthly_add": 0.0})
                self.store.save_settings(s)
            rows.setdefault(_hid("manual", inst, asset), {})["Value"] = v
        elif t == "remove_manual":
            s = self.store.settings()
            s["manual"] = [m for m in s["manual"] if not (m.get("Institution") == a.get("Institution") and m.get("Asset") == a.get("Asset"))]
            self.store.save_settings(s)
        elif t == "clear":
            self.clear()
            return
        else:
            raise ValueError("Ação desconhecida.")
        self.saved_month = ""
        self.persist()

    # ---- output: the month as FinTrack rows, with the "na curva" value of public bonds
    def rows_for_fintrack(self, bonds: list) -> Dict[str, Any]:
        res = self.result()
        rows = res["csv_rows"]
        m = date.fromisoformat(res["month"])
        note = ""
        if bonds:
            try:
                from core import curve
                book = curve.load(curve.from_rows(bonds))
                on = min(curve.last_business_day(m.year, m.month), date.today())
                for r in rows:
                    if r["Classification"] == "Título Público":
                        v = curve.curve_for_row(book, r["Institution"], r["Asset"], on)
                        if v is not None:
                            r["ValueCurve"] = v
            except Exception as e:   # the curve value is a bonus; the month must come out regardless
                note = f"Valor na curva não calculado ({e})."
        self.store.save_month(m, rows)
        self.saved_month = res["month"]
        self.persist()
        return {"date": dash_date(m), "rows": rows, "note": note}


APP: Optional[App] = None


def _ok(fn):
    def wrapped(*args):
        try:
            return json.dumps({"ok": True, "data": fn(*args)}, ensure_ascii=False, default=str)
        except ValueError as e:
            return json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False)
        except Exception as e:  # noqa: BLE001
            import traceback
            traceback.print_exc()
            return json.dumps({"ok": False, "error": f"Erro inesperado: {e}"}, ensure_ascii=False)
    return wrapped


@_ok
def start(history_json: str, settings_json: str):
    global APP
    APP = App()
    APP.load_history(json.loads(history_json or "[]"))
    APP.set_settings(json.loads(settings_json or "{}"))
    return APP.result()


@_ok
def state():
    return APP.result()


@_ok
def act(action_json: str):
    APP.action(json.loads(action_json))
    return APP.result()


@_ok
def add_page(name: str, reading_json: str):
    return APP.add_page(name, json.loads(reading_json))


@_ok
def finish(bonds_json: str):
    return APP.rows_for_fintrack(json.loads(bonds_json or "[]"))
