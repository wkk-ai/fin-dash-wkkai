"""Read Brazilian Real amounts out of recognised text, and say how sure the reading is."""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import List, Optional


def fold(text: str) -> str:
    """Lowercase, no accents, single spaces. For matching labels."""
    text = unicodedata.normalize("NFKD", (text or "").lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", text).strip()


@dataclass
class Amount:
    value: float
    strict: bool      # written exactly like 1.234,56 (nothing guessed)
    raw: str
    negative: bool = False


# R$ then an optional sign, then digits with separators.
_RS = r"R\s?\$\s*(?P<sign>[-–−]\s*)?"
_NUM = r"(?P<num>\d[\d.,]*\d|\d)"
_AMOUNT_RE = re.compile(_RS + _NUM)
_STRICT = re.compile(r"^\d{1,3}(\.\d{3})*,\d{2}$")


def _parse_number(num: str) -> Optional[Amount]:
    if _STRICT.match(num):
        return Amount(float(num.replace(".", "").replace(",", ".")), True, num)
    digits = re.sub(r"[.,]", "", num)
    if not digits.isdigit():
        return None
    # 12345,67  /  12.345.67  /  1,234.56 : last separator followed by exactly 2 digits = cents
    m = re.match(r"^(.*)[.,](\d{2})$", num)
    if m and re.sub(r"[.,]", "", m.group(1)).isdigit():
        return Amount(float(re.sub(r"[.,]", "", m.group(1)) + "." + m.group(2)), False, num)
    # 12.34567 : thousands dots, then the cents glued on (superscript cents)
    m = re.match(r"^(\d{1,3}(?:\.\d{3})+)(\d{2})$", num)
    if m:
        return Amount(float(m.group(1).replace(".", "") + "." + m.group(2)), False, num)
    # 37.980 or 0 : no cents shown
    if re.match(r"^\d{1,3}(\.\d{3})+$", num) or num.isdigit():
        return Amount(float(digits), False, num)
    return None


def find_amounts(text: str) -> List[Amount]:
    """Every R$ amount in a piece of text, in order."""
    out: List[Amount] = []
    for m in _AMOUNT_RE.finditer(text or ""):
        a = _parse_number(m.group("num"))
        if a is None:
            continue
        a.raw = m.group(0)
        if m.group("sign"):
            a.negative = True
            a.value = -a.value
        out.append(a)
    return out


def first_amount(text: str) -> Optional[Amount]:
    found = find_amounts(text)
    return found[0] if found else None


def cents(v: float) -> int:
    return int(round(v * 100))


def same(a: float, b: float) -> bool:
    return cents(a) == cents(b)


def brl(value: float) -> str:
    neg = value < 0
    c = abs(cents(value))
    s = f"{c // 100:,}".replace(",", ".") + f",{c % 100:02d}"
    return ("-R$ " if neg else "R$ ") + s


_MONTHS = {"jan": 1, "fev": 2, "feb": 2, "mar": 3, "abr": 4, "apr": 4, "mai": 5, "may": 5, "jun": 6, "jul": 7,
           "ago": 8, "aug": 8, "set": 9, "sep": 9, "out": 10, "oct": 10, "nov": 11, "dez": 12, "dec": 12}


def find_date(text: str) -> Optional[str]:
    """'15/08/2060', '15 AGO 2040', '01JAN 2035' -> '2060-08-15'."""
    t = fold(text)
    m = re.search(r"\b(\d{2})/(\d{2})/(\d{4})\b", t)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 1 <= d <= 31 and 1 <= mo <= 12:
            return f"{y:04d}-{mo:02d}-{d:02d}"
    m = re.search(r"\b(\d{1,2})\s*([a-z]{3})\s*(\d{4})\b", t)
    if m and m.group(2) in _MONTHS:
        return f"{int(m.group(3)):04d}-{_MONTHS[m.group(2)]:02d}-{int(m.group(1)):02d}"
    return None
