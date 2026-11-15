"""The browser version of the reader gives the same answer as the Mac app on the October 2026 readings."""
import csv
import glob
import json
import os
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))
BENCH = Path(os.environ.get("FR_BENCH", "/home/claude/reader-work/bench/pages"))
SEED = Path(os.environ.get("FR_SEED", "/home/claude/reader-work/data/meses_iniciais"))
pytestmark = pytest.mark.skipif(not BENCH.is_dir(), reason="needs the saved October readings (private, not in the repo)")


@pytest.fixture
def web(tmp_path, monkeypatch):
    import webapp
    monkeypatch.setattr(webapp, "ROOT", tmp_path / "fr")
    history = [r for f in sorted(SEED.glob("*.csv")) for r in csv.DictReader(open(f, encoding="utf-8-sig"))]
    settings = {"manual": [{"Institution": "Nubank", "Asset": "Sara", "Classification": "Renda Fixa", "monthly_add": 1000.0}]}
    out = json.loads(webapp.start(json.dumps(history), json.dumps(settings)))
    assert out["ok"], out
    return webapp


def test_same_month_as_the_mac_app(web):
    json.loads(web.act(json.dumps({"type": "set_month", "month": "2026-10"})))
    for f in sorted(glob.glob(str(BENCH / "*.json"))):
        d = json.load(open(f))
        r = json.loads(web.add_page(Path(f).name[:-5], json.dumps(d)))
        assert r["ok"] and r["data"]["ok"], r
    res = json.loads(web.state())["data"]
    assert res["prev_label"] == "setembro de 2026" and res["n_prints"] == 32
    sara = next(r for b in res["banks"] for r in b["rows"] if r["Asset"] == "Sara")
    web.act(json.dumps({"type": "set_row", "id": sara["id"], "Value": "82.716,00"}))
    res = json.loads(web.act(json.dumps({"type": "dismiss", "key": "missing:clear"})))["data"]
    assert res["status"] == "ok" and res["total"] == 1363078.61
    out = json.loads(web.finish("[]"))["data"]
    assert out["date"] == "01/Oct/26" and round(sum(r["Value"] for r in out["rows"]), 2) == 1363078.61


def test_bad_input_is_a_message_not_a_crash(web):
    r = json.loads(web.act(json.dumps({"type": "set_row", "id": "x", "Value": "abc"})))
    assert not r["ok"] and "Valor inválido" in r["error"]
