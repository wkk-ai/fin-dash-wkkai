"""Turn the recognised screens into one verified list of assets.

Pipeline: drop repeated prints -> read each print -> join cards that are the same
asset seen twice -> prove sections against the totals the banks show -> name and
classify -> compare with the last saved month -> list what still needs a human.

Nothing here raises on bad input; whatever cannot be read becomes an item for the
user to look at instead of a silent guess.
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

from .vision import Page

from .history import dash_date, default_month, month_label
from .money import brl, cents, fold, same
from .screens import INSTITUTIONS, Card, Reading, Screen, Total, recognise

CLASSES = ["Renda Fixa", "Renda Variável", "Título Público", "Previdência"]
SECTION_LABEL = {"xp.rf": "XP · Renda Fixa", "xp.fundos": "XP · Fundos", "xp.td": "XP · Tesouro Direto",
                 "nu.td": "Nubank · Tesouro Direto", "nu.bolsa": "Nubank · Bolsa", "nu.caixinhas": "Nubank · Caixinhas",
                 "nu.livre": "Nubank · Saldo disponível"}
KIND_LABEL = {"xp_list": "lista de ativos", "xp_home": "tela inicial (total)", "nubank_home": "tela inicial",
              "nubank_td": "Tesouro Direto", "nubank_bolsa": "Bolsa", "mercado_pago": "cofrinhos", "itau": "cofrinhos",
              "brasilprev": "previdência", "icatu": "previdência", "fgts": "FGTS"}
BANK_ORDER = ["Nubank", "XP", "Itaú", "Mercado Pago", "Caixa", "Onze", "Brasilprev"]


# ---------------------------------------------------------------- small helpers

def natural_key(name: str):
    return [int(p) if p.isdigit() else p.lower() for p in re.split(r"(\d+)", name or "")]


def _hid(*parts: Any) -> str:
    return hashlib.sha1("|".join(str(p) for p in parts).encode("utf-8")).hexdigest()[:12]


def _titles_compatible(a: str, b: str) -> bool:
    fa, fb = fold(a), fold(b)
    if not fa or not fb:
        return True
    short, long = (fa, fb) if len(fa) <= len(fb) else (fb, fa)
    return long.startswith(short)


def _field_val(v: Any) -> Any:
    return cents(v.value) if isinstance(v, Reading) else v


def _same_card(a: Card, b: Card) -> bool:
    """Same asset photographed twice (overlapping prints)?"""
    if a.section != b.section or a.value is None or b.value is None:
        return False
    if not same(a.value.value, b.value.value) or not _titles_compatible(a.title, b.title):
        return False
    for k in ("rend", "venc", "ticker", "liquido", "aplicado", "qty"):
        if k in a.fields and k in b.fields and _field_val(a.fields[k]) != _field_val(b.fields[k]):
            return False
    return True


def _better(a: Reading, b: Reading) -> Reading:
    score = lambda r: (r.solid, r.agreed is True, r.strict)  # noqa: E731
    return a if score(a) >= score(b) else b


# ---------------------------------------------------------------- assets

@dataclass
class Asset:
    section: str
    inst: str
    title: str = ""
    subtype: str = ""
    value: Optional[Reading] = None
    fields: Dict[str, Any] = field(default_factory=dict)
    pages: List[str] = field(default_factory=list)
    asset: str = ""
    classification: str = ""
    internal_ok: Optional[bool] = None
    conflict: List[Reading] = field(default_factory=list)   # same asset, different values on different prints
    manual: bool = False
    unnamed: bool = False

    @classmethod
    def of(cls, c: Card) -> "Asset":
        return cls(section=c.section, inst=c.inst, title=c.title, subtype=c.subtype, value=c.value, fields=dict(c.fields),
                   pages=[c.page], asset=c.asset, classification=c.classification, internal_ok=c.internal_ok)

    def absorb(self, c: Card) -> None:
        if c.page not in self.pages:
            self.pages.append(c.page)
        if len(c.title) > len(self.title):
            self.title = c.title
        if c.subtype and not self.subtype:
            self.subtype = c.subtype
        for k, v in c.fields.items():
            self.fields.setdefault(k, v)
        if c.value and self.value:
            self.value = _better(self.value, c.value)
        elif c.value:
            self.value = c.value
        if c.internal_ok:
            self.internal_ok = True

    @property
    def id(self) -> str:
        v = cents(self.value.value) if self.value else 0
        if self.asset:
            return _hid(self.inst, self.section, self.asset)
        return _hid(self.inst, self.section, fold(self.title), self.fields.get("venc", ""),
                    self.fields.get("ticker", ""), v)


def _merge_section(cards: List[Card], order: Dict[str, int], issues: List[Dict[str, Any]]) -> List[Asset]:
    """Cards of one list (possibly spread over many overlapping prints) -> distinct assets."""
    cards = sorted(cards, key=lambda c: (order.get(c.page, 0), c.order))
    complete = [c for c in cards if c.title and c.value]
    orphans = [c for c in cards if not c.title and c.value]
    partials = [c for c in cards if c.title and not c.value]

    assets: List[Asset] = []
    for c in complete:
        hit = next((a for a in assets if c.page not in a.pages and _same_card(_as_card(a), c)), None)
        if hit:
            hit.absorb(c)
        else:
            assets.append(Asset.of(c))

    used_partials: List[Card] = []
    for o in orphans:
        hit = next((a for a in assets if o.page not in a.pages and _same_card(_as_card(a), o)), None)
        if hit:
            hit.absorb(o)
            continue
        # top of a card on the previous print, bottom on this one
        prev = [p for p in partials if p not in used_partials and order.get(p.page, 0) == order.get(o.page, 0) - 1]
        prev = [p for p in prev if p.order == max(x.order for x in cards if x.page == p.page)]
        if prev:
            a = Asset.of(prev[0])
            a.absorb(o)
            used_partials.append(prev[0])
            assets.append(a)
            continue
        a = Asset.of(o)
        a.unnamed = True
        assets.append(a)

    for p in partials:
        if p in used_partials:
            continue
        if any(_titles_compatible(a.title, p.title) and p.page not in a.pages for a in assets if not a.unnamed):
            continue    # the full card is on another print
        issues.append({"level": "block", "kind": "cut", "page": p.page, "box": list(p.box),
                       "title": f"Ativo cortado: {p.title}",
                       "detail": "O nome aparece no fim do print, mas o valor não. Falta o print seguinte dessa lista."})
    return assets


def _strong_key(a: Asset) -> Optional[Tuple]:
    """Identity that a bank shows only once: the same key twice means prints from two different moments."""
    if a.asset or a.unnamed:
        return None
    if a.section == "nu.bolsa" and a.fields.get("ticker"):
        return (a.section, a.fields["ticker"])
    if a.section in ("nu.td", "xp.td") and a.fields.get("venc"):
        return (a.section, fold(_tesouro_name(a)), a.fields["venc"])
    if a.section == "xp.fundos" and a.title:
        return (a.section, fold(a.title))
    if a.section == "xp.rf" and a.fields.get("venc") and isinstance(a.fields.get("rend"), Reading) and a.value:
        return (a.section, fold(a.title), a.fields["venc"], cents(a.value.value - a.fields["rend"].value))
    return None


def _resolve_twins(assets: List[Asset], totals: Dict[str, Total], order: Dict[str, int]) -> List[Asset]:
    """Same asset with two different values (prints taken at different moments) must count once."""
    groups: Dict[Tuple, List[Asset]] = {}
    for a in assets:
        k = _strong_key(a)
        if k:
            groups.setdefault(k, []).append(a)
    drop: List[Asset] = []
    for k, group in groups.items():
        if len(group) < 2:
            continue
        section = k[0]
        t = totals.get(section)
        if t is not None:
            sec = [a for a in assets if a.section == section]
            if same(sum(a.value.value for a in sec), t.reading.value) and (t.count is None or t.count == len(sec)):
                continue        # the bank's own total says they are separate holdings
        group.sort(key=lambda a: max(order.get(p, 0) for p in a.pages))
        keep = group[-1]        # the most recent print wins, and the row is flagged
        for other in group[:-1]:
            keep.conflict.append(other.value)
            keep.pages += [p for p in other.pages if p not in keep.pages]
            drop.append(other)
    return [a for a in assets if not any(a is d for d in drop)]


def _as_card(a: Asset) -> Card:
    return Card(page="", inst=a.inst, section=a.section, title=a.title, value=a.value, fields=a.fields)


def _merge_fixed(cards: List[Card]) -> Asset:
    """A one-value asset (Caixinhas, Saldo disponível, FGTS...) seen on one or more prints."""
    a = Asset.of(cards[0])
    for c in cards[1:]:
        if c.value and a.value and not same(c.value.value, a.value.value):
            if not any(same(c.value.value, x.value) for x in a.conflict):
                a.conflict.append(c.value)
            if c.page not in a.pages:
                a.pages.append(c.page)
        else:
            a.absorb(c)
    return a


# ---------------------------------------------------------------- names and classes

def _year(a: Asset) -> str:
    m = re.search(r"\b(20\d{2})\b", a.title)
    if m:
        return m.group(1)
    return (a.fields.get("venc") or "")[:4]


def _tesouro_name(a: Asset) -> str:
    name = re.sub(r"\s*\+\s*", "+ ", a.title).strip()          # "IPCA + 2035" -> "IPCA+ 2035"
    name = re.sub(r"\+\s+(?=com\b)", "+ ", name)
    if re.search(r"com juros", name, re.I) and "Semestrais" not in name:
        name = re.sub(r"com\s+Juros(\s+Se\S*)?", "com Juros Semestrais", name, flags=re.I)
    if not re.search(r"\b20\d{2}\b", name) and _year(a):
        name = f"{name} {_year(a)}"
    return re.sub(r"\s+", " ", name).strip()


def _complete_month_year(title: str, venc: str) -> str:
    """'LCA BANCO X - ABR/2' + maturity 2028-04-17 -> 'LCA BANCO X - ABR/2028'."""
    if venc and re.search(r"/\d{0,3}$", title):
        return re.sub(r"/\d{0,3}$", "/" + venc[:4], title)
    return title


def name_and_class(a: Asset) -> Tuple[str, str]:
    if a.asset:
        return a.asset, a.classification
    t = a.title or "Ativo sem nome"
    sub = fold(a.subtype)
    if a.section == "xp.td":
        return _tesouro_name(a), "Título Público"
    if a.section == "xp.rf":
        is_bond = bool(re.search(r"\b(ntn|lft|ltn|tesouro)", fold(t)))
        name = _complete_month_year(t, a.fields.get("venc", ""))
        rend = a.fields.get("rend")
        if a.value and isinstance(rend, Reading):
            name = f"{name} (apl. {brl(a.value.value - rend.value)[3:]})"
        return name, "Título Público" if is_bond else "Renda Fixa"
    if a.section == "xp.fundos":
        fixed = any(k in sub for k in ("pos-fixado", "inflacao", "renda fixa", "referenciado", "credito", "di "))
        return t, "Renda Fixa" if fixed else "Renda Variável"
    if a.section == "nu.td":
        return _tesouro_name(a), "Título Público"
    if a.section == "nu.bolsa":
        return a.fields.get("ticker") or t, "Renda Variável"
    return t, a.classification or "Renda Fixa"


# ---------------------------------------------------------------- memory: match with last month

def _core(name: str) -> str:
    s = re.sub(r"\s*\(apl\.[^)]*\)\s*$", "", name or "", flags=re.I)
    s = s.replace("…", "").replace("...", "")
    s = re.sub(r"\s*·.*$", "", s)                       # "X · Inflação" -> "X"
    return fold(re.sub(r"\s+", " ", s).strip(" -"))


def _apl(name: str) -> Optional[int]:
    m = re.search(r"\(apl\.\s*([\d.]+,\d{2})\)", name or "", re.I)
    return cents(float(m.group(1).replace(".", "").replace(",", "."))) if m else None


def bond_key(name: str) -> Optional[Tuple[str, str]]:
    f = fold(name).replace(" ", "")
    if not re.search(r"tesouro|ntn|ltn|lft", f):
        return None
    years = re.findall(r"(20\d{2})", f)
    year = years[-1] if years else ""
    if re.search(r"ntn-?b1|renda\+", f):
        return ("b1", year)
    if "princ" in f or ("tesouroipca" in f and "juros" not in f):
        return ("princ", year)
    if re.search(r"ntn-?b", f) or ("ipca" in f and "juros" in f):
        return ("ntnb", year)
    if "prefixado" in f or "ntn-f" in f or "ltn" in f:
        return ("pre-juros" if ("juros" in f or "ntn-f" in f) else "pre", year)
    if "selic" in f or "lft" in f:
        return ("selic", year)
    return None


def _related(a: str, b: str) -> bool:
    ca, cb = _core(a), _core(b)
    if not ca or not cb:
        return False
    if ca == cb:
        return True
    short, long = (ca, cb) if len(ca) <= len(cb) else (cb, ca)
    return len(short) >= 8 and long.startswith(short)


_LOOKALIKE = str.maketrans({"5": "s", "0": "o", "1": "i", "8": "b", "6": "g", "2": "z", "|": "i", "l": "i"})


def _ticker_shape(tk: str) -> str:
    """Text readers confuse 5/S, 0/O, 1/I, 8/B in the letters part of a ticker: compare B35A3 and B3SA3 as one."""
    return tk[:4].translate(_LOOKALIKE) + tk[4:]


def _pair_score(row: Dict[str, Any], old: Dict[str, Any]) -> float:
    if fold(row["Institution"]) != fold(old.get("Institution", "")):
        return 0
    name, oname = row["Asset"], old.get("Asset", "")
    val, oval = float(row["Value"] or 0), float(old.get("Value") or 0)
    close = 9 * (1 - min(1.0, abs(val - oval) / max(abs(oval), 1.0)))
    venc, ovenc = row.get("venc") or "", old.get("venc") or ""
    if venc and ovenc and venc != ovenc:
        return 0
    if row.get("ticker") or old.get("ticker"):
        tk, otk = fold(row.get("ticker") or name), fold(old.get("ticker") or oname)
        if tk == otk:
            return 100
        return 98 if _ticker_shape(tk) == _ticker_shape(otk) else 0   # same ticker read with a 5 for an S
    if fold(name) == fold(oname):
        return 95 + close
    bk = bond_key(name) if row["Classification"] == "Título Público" else None
    obk = bond_key(oname) if old.get("Classification") == "Título Público" else None
    if bk and obk:
        if bk[0] != obk[0] and not (venc and venc == ovenc):
            return 0
        if bk[1] == obk[1]:
            return 90 + close
        return 70 + close if (not bk[1] or not obk[1]) else 0
    if bk or obk:
        return 0
    if not _related(name, oname):
        return 0
    score = 60.0
    if venc and venc == ovenc:
        score += 30
    a1, a2 = _apl(name), _apl(oname)
    if a1 is not None and a2 is not None:
        score += 30 if a1 == a2 else -40
    return score + close


def match_previous(rows: List[Dict[str, Any]], prev: List[Dict[str, Any]]) -> Dict[int, int]:
    """One-to-one pairing of this month's rows with last month's. Returns {row index: prev index}."""
    pairs = []
    for i, r in enumerate(rows):
        for j, o in enumerate(prev):
            s = _pair_score(r, o)
            if s > 0:
                pairs.append((s, i, j))
    pairs.sort(key=lambda p: -p[0])
    out: Dict[int, int] = {}
    taken = set()
    for s, i, j in pairs:
        if s >= 50 and i not in out and j not in taken:
            out[i] = j
            taken.add(j)
    # leftovers: accept a weak match only when it is the single candidate on both sides
    for s, i, j in pairs:
        if i in out or j in taken:
            continue
        mine = [p for p in pairs if p[1] == i and p[2] not in taken]
        theirs = [p for p in pairs if p[2] == j and p[1] not in out]
        if len(mine) == 1 and len(theirs) == 1:
            out[i] = j
            taken.add(j)
    return out


# ---------------------------------------------------------------- proofs

@dataclass
class Proof:
    key: str
    label: str
    expected: float
    got: float
    page: str
    box: List[float]
    count_expected: Optional[int] = None
    count_got: Optional[int] = None
    covers: List[str] = field(default_factory=list)     # sections proven when this closes
    inst: str = ""

    @property
    def ok(self) -> bool:
        return same(self.expected, self.got) and (self.count_expected is None or self.count_expected == self.count_got)

    def to_dict(self) -> Dict[str, Any]:
        return {"key": self.key, "label": self.label, "expected": self.expected, "got": round(self.got, 2), "ok": self.ok,
                "diff": round(self.got - self.expected, 2), "count_expected": self.count_expected,
                "count_got": self.count_got, "page": self.page, "box": self.box, "inst": self.inst}


_PROOF_SCOPE = {
    "xp.rf": ("XP", ["xp.rf"]), "xp.fundos": ("XP", ["xp.fundos"]), "xp.all": ("XP", ["xp.rf", "xp.fundos", "xp.td"]),
    "nu.td": ("Nubank", ["nu.td"]), "nu.bolsa": ("Nubank", ["nu.bolsa"]),
    "nu.carteira": ("Nubank", ["nu.td", "nu.bolsa"]), "nu.all": ("Nubank", ["nu.td", "nu.bolsa", "nu.caixinhas"]),
}
_PROOF_LABEL = {"xp.rf": "Renda Fixa da XP", "xp.fundos": "Fundos da XP", "xp.all": "Total da XP",
                "nu.td": "Tesouro Direto do Nubank", "nu.bolsa": "Bolsa do Nubank",
                "nu.carteira": "Minha carteira do Nubank", "nu.all": "Total investido do Nubank"}


# ---------------------------------------------------------------- main

def analyse(pages: List[Page], overrides: Optional[Dict[str, Any]] = None, prev_rows: Optional[List[Dict[str, Any]]] = None,
            prev_date: Optional[date] = None, settings: Optional[Dict[str, Any]] = None, month: Optional[date] = None,
            today: Optional[date] = None) -> Dict[str, Any]:
    ov = overrides or {}
    ov_rows: Dict[str, Dict[str, Any]] = ov.get("rows") or {}
    ov_prints: Dict[str, Dict[str, Any]] = ov.get("prints") or {}
    prev_rows = prev_rows or []
    settings = settings or {}
    today = today or date.today()
    issues: List[Dict[str, Any]] = []
    prints: List[Dict[str, Any]] = []

    # 1. repeated prints (same file, or same picture saved twice)
    pages = sorted(pages, key=lambda p: natural_key(p.name))
    order = {p.name: i for i, p in enumerate(pages)}
    seen: Dict[str, str] = {}
    unique: List[Page] = []
    for p in pages:
        sig = p.sha1 or ""
        text_sig = _hid(p.width, p.height, *[f"{t.text}@{round(t.x0)},{round(t.y0)}" for t in p.tokens]) if p.tokens else ""
        dup = seen.get("f:" + sig) if sig else None
        dup = dup or (seen.get("t:" + text_sig) if text_sig else None)
        if dup:
            prints.append({"name": p.name, "status": "duplicate", "inst": "", "what": f"repetido (igual a {dup})", "rows": 0})
            continue
        if sig:
            seen["f:" + sig] = p.name
        if text_sig:
            seen["t:" + text_sig] = p.name
        unique.append(p)

    # 2. read every print
    screens: List[Screen] = []
    hints: List[str] = []
    for p in unique:
        po = ov_prints.get(p.name) or {}
        if po.get("ignore"):
            prints.append({"name": p.name, "status": "ignored", "inst": "", "what": "ignorado por você", "rows": 0})
            continue
        scr = recognise(p, force_inst=po.get("inst") or "")
        if scr.date_hint:
            hints.append(scr.date_hint)
        if p.error:
            prints.append({"name": p.name, "status": "error", "inst": "", "what": p.error, "rows": 0})
            issues.append({"level": "block", "kind": "print_error", "page": p.name, "title": f"Não consegui ler {p.name}",
                           "detail": p.error, "actions": ["ignore"]})
            continue
        if not scr.inst:
            manual = po.get("manual") or []
            if manual:
                prints.append({"name": p.name, "status": "manual", "inst": manual[0].get("Institution", ""),
                               "what": "valor escolhido por você", "rows": len(manual)})
                for k, m in enumerate(manual):
                    r = Reading(value=float(m.get("Value") or 0), page=p.name, box=tuple(m.get("box") or (0, 0, p.width, p.height)))
                    screens.append(Screen(page=p.name, inst=m.get("Institution", ""), kind="manual", cards=[
                        Card(page=p.name, inst=m.get("Institution", ""), section=f"manual.{p.name}.{k}",
                             title=m.get("Asset", ""), value=r, asset=m.get("Asset", ""),
                             classification=m.get("Classification", "Renda Fixa"))]))
                continue
            forced = po.get("inst") or ""
            prints.append({"name": p.name, "status": "unknown", "inst": forced, "what": "não reconhecido", "rows": 0})
            issues.append({
                "level": "block", "kind": "unknown_print", "page": p.name,
                "title": f"Não reconheci este print ({p.name})",
                "detail": ("Não sei ler essa tela desse banco. " if forced else "Não sei de qual banco é essa tela. ")
                          + "Escolha o valor que conta e dê um nome, ou ignore o print.",
                "amounts": [r.to_dict() for r in sorted(scr.loose, key=lambda r: -abs(r.value))[:8]],
                "institutions": INSTITUTIONS, "classes": CLASSES, "actions": ["manual", "ignore"]})
            continue
        if scr.rival and not po.get("inst"):
            issues.append({"level": "block", "kind": "bank_doubt", "page": p.name,
                           "title": f"De qual banco é este print? ({p.name})",
                           "detail": f"Parece {scr.inst}, mas também pode ser {scr.rival}.",
                           "options": [scr.inst, scr.rival], "actions": ["set_bank", "ignore"]})
        for note in scr.notes:
            issues.append({"level": "block", "kind": "print_note", "page": p.name, "title": note,
                           "detail": f"Print {p.name}.", "actions": ["ignore"]})
        screens.append(scr)
        n = len([c for c in scr.cards if c.value])
        what = KIND_LABEL.get(scr.kind, scr.kind)
        prints.append({"name": p.name, "status": "used", "inst": scr.inst, "what": what, "rows": n,
                       "totals_only": n == 0 and bool(scr.totals)})

    # 4. the totals the banks show
    totals: Dict[str, Total] = {}
    for scr in screens:
        for t in scr.totals:
            if t.key in totals and not same(totals[t.key].reading.value, t.reading.value):
                issues.append({"level": "block", "kind": "total_conflict", "page": t.reading.page, "box": list(t.reading.box),
                               "title": f"Dois totais diferentes para {_PROOF_LABEL.get(t.key, t.key)}",
                               "detail": f"{brl(totals[t.key].reading.value)} em {totals[t.key].reading.page} e "
                                         f"{brl(t.reading.value)} em {t.reading.page}. Os prints são do mesmo momento?"})
            totals.setdefault(t.key, t)

    # 3. same asset seen on several prints -> one asset
    by_section: Dict[str, List[Card]] = {}
    for scr in screens:
        for c in scr.cards:
            by_section.setdefault(c.section, []).append(c)
    assets: List[Asset] = []
    for section, cards in by_section.items():
        if cards[0].asset:
            assets.append(_merge_fixed(cards))
        else:
            assets.extend(_merge_section(cards, order, issues))
    assets = [a for a in assets if a.value is not None]
    assets = _resolve_twins(assets, totals, order)
    for key, ex in (ov.get("extras") or {}).items():
        t = totals.get(key)
        if t is None or not isinstance(ex, dict):
            continue
        try:
            v = float(ex.get("Value"))
        except (TypeError, ValueError):
            continue
        r = Reading(value=v, page=t.reading.page, box=t.reading.box)
        assets.append(Asset(section="extra." + key, inst=_PROOF_SCOPE.get(key, ("", []))[0], title="Saldo em conta", value=r,
                            pages=[t.reading.page], asset=ex.get("Asset") or "Saldo em conta", classification="Renda Fixa"))

    # 5. rows (apply the user's edits) ------------------------------------------------
    rows: List[Dict[str, Any]] = []
    for a in assets:
        name, cls = name_and_class(a)
        r = a.value
        row = {"id": a.id, "Institution": a.inst, "Asset": name, "Classification": cls, "Value": round(r.value, 2),
               "section": a.section, "pages": a.pages, "page": r.page, "box": [round(v) for v in r.box],
               "venc": a.fields.get("venc", ""), "ticker": a.fields.get("ticker", ""), "read_value": round(r.value, 2),
               "reading": r, "internal_ok": a.internal_ok, "auto_name": name, "unnamed": a.unnamed,
               "conflict": a.conflict, "excluded": False, "edited": False,
               "confirmed": a.section.startswith(("manual.", "extra.")), "manual": False}
        rows.append(row)

    # 6. memory: last month's names, classes and values
    pairing = match_previous(rows, prev_rows)
    for i, row in enumerate(rows):
        old = prev_rows[pairing[i]] if i in pairing else None
        row["prev"] = round(float(old.get("Value") or 0), 2) if old else None
        row["is_new"] = old is None and bool(prev_rows)
        if old:
            row["Asset"] = old.get("Asset") or row["Asset"]
            if old.get("Classification") in CLASSES:
                row["Classification"] = old["Classification"]
    matched_prev = set(pairing.values())

    # manual lines the user keeps every month (no print exists for them)
    for m in settings.get("manual") or []:
        inst, asset = m.get("Institution", ""), m.get("Asset", "")
        if not inst or not asset:
            continue
        if any(fold(r["Institution"]) == fold(inst) and fold(r["Asset"]) == fold(asset) for r in rows):
            continue
        j = next((j for j, o in enumerate(prev_rows) if j not in matched_prev and fold(o.get("Institution", "")) == fold(inst)
                  and fold(o.get("Asset", "")) == fold(asset)), None)
        old_v = float(prev_rows[j].get("Value") or 0) if j is not None else None
        if j is not None:
            matched_prev.add(j)
        guess = round((old_v or 0) + float(m.get("monthly_add") or 0), 2) if old_v is not None else 0.0
        rows.append({"id": _hid("manual", inst, asset), "Institution": inst, "Asset": asset,
                     "Classification": m.get("Classification") or "Renda Fixa", "Value": guess, "section": "manual",
                     "pages": [], "page": "", "box": [], "venc": "", "ticker": "", "read_value": guess, "reading": None,
                     "internal_ok": None, "auto_name": asset, "unnamed": False, "conflict": [], "excluded": False,
                     "edited": False, "confirmed": False, "manual": True, "prev": old_v, "is_new": False,
                     "monthly_add": float(m.get("monthly_add") or 0)})

    for row in rows:
        o = ov_rows.get(row["id"]) or {}
        if "Value" in o and o["Value"] is not None:
            try:
                row["Value"] = round(float(o["Value"]), 2)
                row["edited"] = not same(row["Value"], row["read_value"]) or row["manual"]
                row["confirmed"] = True
            except (TypeError, ValueError):
                pass
        for k in ("Asset", "Classification", "Institution"):
            if o.get(k):
                row[k] = str(o[k]).strip()
        if o.get("confirmed"):
            row["confirmed"] = True
        row["excluded"] = bool(o.get("excluded"))

    # 7. proofs: do the rows add up to what each bank shows?
    proofs: List[Proof] = []
    proven_sections: set = set()
    live = [r for r in rows if not r["excluded"]]
    present_sections = {r["section"] for r in rows}
    for key, t in totals.items():
        inst, covers = _PROOF_SCOPE.get(key, ("", []))
        got_rows = [r for r in live if r["section"] in covers or r["section"] == "extra." + key]
        p = Proof(key=key, label=_PROOF_LABEL.get(key, t.label), expected=t.reading.value,
                  got=sum(r["Value"] for r in got_rows), page=t.reading.page, box=[round(v) for v in t.reading.box],
                  covers=covers, inst=inst)
        if t.count is not None:
            p.count_expected, p.count_got = t.count, len(got_rows)
        if not p.ok and t.reading.alt_value is not None and same(t.reading.alt_value, p.got):
            p.expected = t.reading.alt_value      # the two readers disagreed on the total; the rows settle it
        proofs.append(p)
        if p.ok:
            proven_sections.update(covers)
    for p in proofs:
        if p.ok:
            continue
        subs_ok = [q for q in proofs if q.ok and q.key != p.key and set(q.covers) < set(p.covers)]
        diff = p.got - p.expected
        missing_secs = [s for s in p.covers if s not in present_sections]
        hint = ""
        if missing_secs:
            hint = "Faltam os prints de: " + ", ".join(SECTION_LABEL.get(s, s) for s in missing_secs) + "."
        elif p.count_expected is not None and p.count_got is not None and p.count_got < p.count_expected:
            n = p.count_expected - p.count_got
            hint = f"A tela diz {p.count_expected} ativos e eu li {p.count_got}: falta print de {n} ativo(s) somando {brl(-diff)}."
        elif p.count_expected is not None and p.count_got is not None and p.count_got > p.count_expected:
            hint = f"A tela diz {p.count_expected} ativos e eu li {p.count_got}: pode haver ativo contado duas vezes."
        elif diff < 0:
            hint = f"Faltam {brl(-diff)} nas linhas. Falta algum print, ou há saldo que não está em nenhuma lista."
        else:
            dup = next((r for r in live if r["section"] in p.covers and same(r["Value"], diff)), None)
            hint = f"As linhas somam {brl(diff)} a mais." + (f" É exatamente o valor de “{dup['Asset']}”: contado duas vezes?" if dup else "")
        level = "warn" if (subs_ok and not missing_secs and all(s in proven_sections for s in p.covers)) else "block"
        extra = None
        if p.key == "xp.all" and diff < 0 and not missing_secs and ("extra." + p.key) not in present_sections:
            # the XP total includes cash sitting in the account, which no list shows
            extra = round(-diff, 2)
            hint = (f"Faltam {brl(-diff)} nas linhas. Se for dinheiro parado na conta da XP, conte como saldo em conta; "
                    "se não, falta algum print.")
            level = "block"
        issues.append({"level": level, "kind": "sum", "page": p.page, "box": p.box, "proof": p.key, "extra": extra,
                       "title": f"{p.label}: a soma não bate com a tela",
                       "detail": f"Tela: {brl(p.expected)}. Linhas: {brl(p.got)}. {hint}"})

    # 8. how much each row can be trusted
    for row in rows:
        rd: Optional[Reading] = row["reading"]
        if row["manual"]:
            trust = "user" if row["confirmed"] else "manual"
        elif row["edited"] or row["confirmed"]:
            trust = "user"
        elif row["conflict"]:
            trust = "review"
        elif row["section"] in proven_sections and rd is not None and rd.agreed is not False:
            trust = "proven"
        elif rd is not None and rd.solid and (rd.agreed is True or row["internal_ok"] is True):
            trust = "checked"
        else:
            trust = "review"
        if row["unnamed"] and not (ov_rows.get(row["id"]) or {}).get("Asset"):
            trust = "review"
        row["trust"] = trust
        if row["excluded"]:
            continue
        if trust == "manual":
            issues.append({"level": "block", "kind": "manual_value", "row": row["id"],
                           "title": f"Informe o valor de {row['Asset']} ({row['Institution']})",
                           "detail": ("Não existe print para esta linha. "
                                      + (f"Mês passado: {brl(row['prev'])}. " if row.get("prev") is not None else "")
                                      + (f"Sugestão: mês passado + {brl(row['monthly_add'])}." if row.get("monthly_add") and row.get("prev") is not None else "")),
                           "actions": ["set_value"]})
        elif trust == "review":
            why = []
            if row["conflict"]:
                why.append("o mesmo ativo aparece com valores diferentes em prints diferentes: "
                           + ", ".join(brl(x.value) for x in [rd] + row["conflict"] if x))
            if row["unnamed"]:
                why.append("não achei o nome deste ativo (o topo do cartão ficou fora do print)")
            if rd is not None and rd.agreed is False:
                why.append(f"as duas leituras discordam: {brl(rd.value)} ou {brl(rd.alt_value or 0)}")
            if rd is not None and not rd.strict:
                why.append("o número veio mal formatado no print")
            if rd is not None and rd.guessed:
                why.append("o rótulo “Saldo” não foi lido; peguei o primeiro valor do cartão")
            if rd is not None and rd.agreed is None and not why:
                why.append("só consegui uma leitura e não há total na tela para confirmar")
            opts = []
            if rd is not None:
                opts = [rd.value] + ([rd.alt_value] if rd.alt_value is not None else []) + [x.value for x in row["conflict"]]
            issues.append({"level": "block", "kind": "check_value", "row": row["id"], "page": row["page"], "box": row["box"],
                           "title": f"Confira: {row['Asset']} ({row['Institution']})",
                           "detail": "; ".join(why).capitalize() + ".", "options": sorted(set(round(o, 2) for o in opts)),
                           "actions": ["set_value", "confirm", "exclude"]})

    # 9. compared with last month
    banks_now = {fold(r["Institution"]) for r in live}
    gone = [o for j, o in enumerate(prev_rows) if j not in matched_prev]
    missing_banks: Dict[str, float] = {}
    gone_rows = []
    for o in gone:
        if fold(o.get("Institution", "")) not in banks_now:
            missing_banks[o.get("Institution", "")] = missing_banks.get(o.get("Institution", ""), 0) + float(o.get("Value") or 0)
        else:
            gone_rows.append({"Institution": o.get("Institution", ""), "Asset": o.get("Asset", ""),
                              "Classification": o.get("Classification", ""), "Value": float(o.get("Value") or 0)})
    if pages:
        for inst, v in sorted(missing_banks.items(), key=lambda kv: -kv[1]):
            if (ov.get("dismissed") or {}).get("missing:" + fold(inst)):
                continue
            issues.append({"level": "block", "kind": "missing_bank", "key": "missing:" + fold(inst),
                           "title": f"Faltou o print de {inst}",
                           "detail": f"Mês passado havia {brl(v)} em {inst} e agora não veio nenhum print desse banco.",
                           "actions": ["dismiss"]})

    # 10. assemble the answer
    if month is None:
        if hints:
            best = max(set(hints), key=hints.count)
            try:
                month = default_month(date.fromisoformat(best))
            except ValueError:
                month = default_month(today)
        else:
            month = default_month(today)

    def public(row: Dict[str, Any]) -> Dict[str, Any]:
        out = {k: row[k] for k in ("id", "Institution", "Asset", "Classification", "Value", "section", "page", "box", "pages",
                                   "venc", "ticker", "read_value", "excluded", "edited", "manual", "trust", "prev", "is_new")}
        out["delta"] = None if row.get("prev") is None else round(row["Value"] - row["prev"], 2)
        return out

    banks: List[Dict[str, Any]] = []
    insts = sorted({r["Institution"] for r in rows},
                   key=lambda i: (BANK_ORDER.index(i) if i in BANK_ORDER else 99, i))
    for inst in insts:
        rs = sorted([r for r in rows if r["Institution"] == inst], key=lambda r: (r["Classification"], -r["Value"]))
        kept = [r for r in rs if not r["excluded"]]
        prev_total = sum(float(o.get("Value") or 0) for o in prev_rows if fold(o.get("Institution", "")) == fold(inst))
        bank_proofs = [p.to_dict() for p in proofs if p.inst == inst]
        trusts = {r["trust"] for r in kept}
        state = "review" if (trusts & {"review", "manual"}) or any(not p["ok"] for p in bank_proofs) else "ok"
        banks.append({"inst": inst, "total": round(sum(r["Value"] for r in kept), 2),
                      "prev": round(prev_total, 2) if prev_rows else None, "rows": [public(r) for r in rs],
                      "proofs": bank_proofs, "state": state,
                      "gone": [g for g in gone_rows if fold(g["Institution"]) == fold(inst)]})

    total = round(sum(r["Value"] for r in live), 2)
    prev_total = round(sum(float(o.get("Value") or 0) for o in prev_rows), 2) if prev_rows else None
    by_class = []
    for c in CLASSES + sorted({r["Classification"] for r in live} - set(CLASSES)):
        v = sum(r["Value"] for r in live if r["Classification"] == c)
        if v:
            by_class.append({"classification": c, "value": round(v, 2), "share": round(v / total, 4) if total else 0})
    for n, it in enumerate(issues):
        it.setdefault("id", _hid(it.get("kind"), it.get("page", ""), it.get("row", ""), it.get("proof", ""), it.get("title", "")))
    blocks = [i for i in issues if i["level"] == "block"]
    counts = {t: len([r for r in live if r["trust"] == t]) for t in ("proven", "checked", "user", "review", "manual")}
    return {
        "month": month.isoformat(), "date": dash_date(month), "month_label": month_label(month),
        "total": total, "prev_total": prev_total,
        "prev_label": month_label(prev_date) if prev_date else "", "prev_date": dash_date(prev_date) if prev_date else "",
        "delta": None if prev_total is None else round(total - prev_total, 2),
        "status": "empty" if not pages else ("review" if blocks else "ok"),
        "issues": sorted(issues, key=lambda i: {"block": 0, "warn": 1, "info": 2}[i["level"]]),
        "banks": banks, "prints": prints, "proofs": [p.to_dict() for p in proofs], "by_class": by_class,
        "counts": counts, "n_rows": len(live), "n_prints": len(pages),
        "csv_rows": [{"Date": dash_date(month), "Classification": r["Classification"], "Institution": r["Institution"],
                      "Asset": r["Asset"], "Value": r["Value"], "venc": r["venc"], "ticker": r["ticker"]}
                     for r in sorted(live, key=lambda r: (r["Classification"], r["Institution"], r["Asset"], r["Value"]))
                     if abs(r["Value"]) >= 0.005],
    }
