"""Small tolerances the browser's text reader needs (it mixes up 5/S, bullets, and sometimes a digit of a total)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from core.engine import _pair_score, _ticker_shape  # noqa: E402


def test_ticker_read_with_a_five_still_pairs_with_last_month():
    assert _ticker_shape("b35a3") == _ticker_shape("b3sa3")
    new = {"Institution": "Nubank", "Asset": "B35A3", "ticker": "B35A3", "Value": 1880.2, "Classification": "Renda Variável"}
    old = {"Institution": "Nubank", "Asset": "B3SA3", "Value": 1800.0, "Classification": "Renda Variável"}
    assert _pair_score(new, old) == 98


def test_different_share_classes_never_pair():
    new = {"Institution": "Nubank", "Asset": "BBAS4", "ticker": "BBAS4", "Value": 1.0, "Classification": "Renda Variável"}
    old = {"Institution": "Nubank", "Asset": "BBAS3", "Value": 1.0, "Classification": "Renda Variável"}
    assert _pair_score(new, old) == 0
