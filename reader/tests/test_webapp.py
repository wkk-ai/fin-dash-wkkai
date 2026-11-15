"""The browser version of the reader (webapp.py) gives the same month as the engine run directly.

Needs a folder of saved readings (private: real balances, never in this repo):
FR_BENCH=<folder with *.PNG.json readings>  FR_SEED=<folder with the previous months' CSVs>.
"""
import csv
import glob
import json
import os
import sys
from datetime import date
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))
BENCH = Path(os.environ.get("FR_BENCH", "/nonexistent"))
SEED = Path(os.environ.get("FR_SEED", "/nonexistent"))

@pytest.mark.skipif(not BENCH.is_dir(), reason="needs private saved readings (FR_BENCH)")
def test_same_month_as_the_engine(tmp_path, monkeypatch):
    import webapp
    from core.engine import analyse
    from core.history import parse_dash_date
    from core.vision import Page

    monkeypatch.setattr(webapp, "ROOT", tmp_path / "fr")
    history = [r for f in sorted(SEED.glob("*.csv")) for r in csv.DictReader(open(f, encoding="utf-8-sig"))]
    assert json.loads(webapp.start(json.dumps(history), "{}"))["ok"]
    files = sorted(glob.glob(str(BENCH / "*.json")))
    pages = []
    for f in files:
        reading = json.load(open(f))
        assert json.loads(webapp.add_page(Path(f).name[:-5], json.dumps(reading)))["data"]["ok"]
        pages.append(Page.from_dict(dict(reading, name=Path(f).name[:-5])))
    res = json.loads(webapp.state())["data"]
    m = date.fromisoformat(res["month"])
    prev = [r for r in history if (d := parse_dash_date(r["Date"])) and date(d.year, d.month, 1) < m]
    last = max((parse_dash_date(r["Date"]) for r in prev), default=None)
    prev_rows = [dict(r, Value=float(r["Value"])) for r in prev if parse_dash_date(r["Date"]) == last]
    direct = analyse(pages, prev_rows=prev_rows, prev_date=last and date(last.year, last.month, 1), month=m,
                     settings={"manual": [], "folder": ""})
    assert res["total"] == direct["total"] and len(res["csv_rows"]) == len(direct["csv_rows"])
    out = json.loads(webapp.finish("[]"))["data"]
    assert round(sum(r["Value"] for r in out["rows"]), 2) == res["total"]


def test_bad_input_is_a_message_not_a_crash(tmp_path, monkeypatch):
    import webapp
    monkeypatch.setattr(webapp, "ROOT", tmp_path / "fr")
    webapp.start("[]", "{}")
    r = json.loads(webapp.act(json.dumps({"type": "set_row", "id": "x", "Value": "abc"})))
    assert not r["ok"] and "Valor inválido" in r["error"]
