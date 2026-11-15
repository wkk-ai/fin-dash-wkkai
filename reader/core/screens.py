"""Recognise each screenshot (which bank, which screen) and read its assets by position.

Every value is read from where it sits on the screen (next to its label, under its
title), never from the order the text happens to come in. Each screen also gives
its own totals and item counts, which the engine later uses to prove the rows.
"""
from __future__ import annotations

import difflib
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from .vision import Page, Token

from .money import Amount, find_amounts, find_date, fold, same


# ---------------------------------------------------------------- data

@dataclass
class Reading:
    """One amount read at one place on one print."""
    value: float
    page: str
    box: Tuple[float, float, float, float]
    strict: bool = True                 # written as 1.234,56 with nothing guessed
    agreed: Optional[bool] = None       # second engine: True same, False different, None not available
    alt_value: Optional[float] = None
    guessed: bool = False               # position was inferred (label missing)

    @property
    def solid(self) -> bool:
        return self.strict and self.agreed is not False and not self.guessed

    def to_dict(self) -> Dict[str, Any]:
        return {"value": self.value, "page": self.page, "box": [round(v) for v in self.box], "strict": self.strict,
                "agreed": self.agreed, "alt_value": self.alt_value, "guessed": self.guessed}


@dataclass
class Card:
    """One asset as shown on one print."""
    page: str
    inst: str
    section: str            # xp.rf, xp.fundos, xp.td, nu.td, nu.bolsa, nu.home, simple...
    title: str = ""         # "" = top of the card was cut off
    subtype: str = ""
    value: Optional[Reading] = None     # None = bottom of the card was cut off
    fields: Dict[str, Any] = field(default_factory=dict)   # rend, liquido, aplicado (Reading) / venc, ticker, qty (str)
    box: Tuple[float, float, float, float] = (0, 0, 0, 0)
    order: int = 0          # position on the page, top to bottom
    internal_ok: Optional[bool] = None  # arithmetic inside the card closes (when the card allows it)
    asset: str = ""         # fixed asset name for one-value screens
    classification: str = ""


@dataclass
class Total:
    """A total the bank itself shows, used to prove the rows add up."""
    key: str                # which group of cards it covers, e.g. "xp.rf", "nu.td", "xp.all"
    label: str
    reading: Reading
    count: Optional[int] = None


@dataclass
class Screen:
    page: str
    inst: str = ""          # "" = not recognised
    kind: str = "unknown"
    score: int = 0
    rival: str = ""         # another bank that also looked plausible
    cards: List[Card] = field(default_factory=list)
    totals: List[Total] = field(default_factory=list)
    loose: List[Reading] = field(default_factory=list)   # every amount on the print (for prints we could not read)
    date_hint: str = ""     # yyyy-mm-dd seen on the print
    notes: List[str] = field(default_factory=list)


# ---------------------------------------------------------------- layout helpers

def _overlap_1d(a0, a1, b0, b1) -> float:
    return max(0.0, min(a1, b1) - max(a0, b0))


def same_row(a: Token, b: Token) -> bool:
    return _overlap_1d(a.y0, a.y1, b.y0, b.y1) >= 0.5 * min(a.h, b.h)


def _alt_amounts(page: Page, tok: Token) -> List[Amount]:
    out: List[Amount] = []
    for alt in page.alt_tokens:
        iy = _overlap_1d(tok.y0, tok.y1, alt.y0, alt.y1)
        ix = _overlap_1d(tok.x0, tok.x1, alt.x0, alt.x1)
        if iy >= 0.5 * min(tok.h, alt.h) and ix >= 0.5 * min(tok.w, alt.w):
            out.extend(find_amounts(alt.text))
    return out


def reading_of(page: Page, tok: Token, which: int = 0, guessed: bool = False) -> Optional[Reading]:
    """The amount written in a token, double-checked against the second engine."""
    found = find_amounts(tok.text)
    if len(found) <= which:
        return None
    a = found[which]
    r = Reading(value=a.value, page=page.name, box=(tok.x0, tok.y0, tok.x1, tok.y1), strict=a.strict, guessed=guessed)
    if tok.conf < 0.4:
        r.strict = False
    if page.alt_tokens:
        alts = _alt_amounts(page, tok)
        if alts:
            if any(same(x.value, a.value) for x in alts):
                r.agreed = True
                if not r.strict and any(x.strict and same(x.value, a.value) for x in alts):
                    r.strict = True     # second engine read the full, well-formed number
            else:
                r.agreed = False
                best = [x for x in alts if x.strict] or alts
                r.alt_value = best[0].value
                if not a.strict and best[0].strict:
                    # the well-formed reading wins, but the disagreement stays flagged
                    r.value, r.alt_value = best[0].value, a.value
    return r


def _has_amount(tok: Token) -> bool:
    return bool(find_amounts(tok.text))


def _find(page: Page, pattern: str, x_max: float = 1.0, y_max: float = 1.0) -> List[Token]:
    rx = re.compile(pattern)
    return [t for t in page.tokens if rx.search(fold(t.text)) and t.x0 <= x_max * page.width and t.cy <= y_max * page.height]


def _right_value(page: Page, label: Token, pool: List[Token]) -> Optional[Token]:
    """The token on the label's row, to its right (the value column)."""
    cands = [t for t in pool if t is not label and same_row(label, t) and t.x0 >= label.x1 - 0.01 * page.width]
    return max(cands, key=lambda t: t.x1) if cands else None


def _below_amount(page: Page, label: Token, max_gap: float = 4.0) -> Optional[Token]:
    """Nearest amount under a label (same column)."""
    cands = []
    for t in page.tokens:
        if t is label or not _has_amount(t):
            continue
        gap = t.y0 - label.y1
        if gap < -0.3 * label.h or gap > max_gap * max(label.h, 20):
            continue
        if _overlap_1d(label.x0, label.x1, t.x0, t.x1) <= 0 and abs(t.x0 - label.x0) > 0.05 * page.width:
            continue
        cands.append((gap, t))
    return min(cands, key=lambda c: c[0])[1] if cands else None


def _like(text: str, target: str, cutoff: float = 0.8) -> bool:
    a = fold(text)
    return a == target or difflib.SequenceMatcher(None, a, target).ratio() >= cutoff


def _date_hint(page: Page) -> str:
    for t in page.tokens:
        f = fold(t.text)
        m = re.search(r"atualiza\w*\s+(?:em\s+)?(\d{2})/(\d{2})/(\d{2,4})", f)
        if m:
            y = int(m.group(3))
            y += 2000 if y < 100 else 0
            return f"{y:04d}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    return ""


def _clean_title(text: str) -> str:
    t = re.sub(r"\s*[>›]\s*$", "", text or "").strip()
    t = t.replace("…", "...")
    t = re.sub(r"\s*\.{2,}\s*$", "", t).strip()
    t = re.sub(r"^[lI1]esouro\b", "Tesouro", t)       # OCR drops the bar of the T
    t = re.sub(r"Rend[Aa]\+", "Renda+", t)
    return re.sub(r"\s+", " ", t)


# ---------------------------------------------------------------- XP (lists of cards)

_XP_SECTIONS = {"renda fixa": "xp.rf", "fundos de investimento": "xp.fundos", "tesouro direto": "xp.td"}
_XP_SUBTYPE = re.compile(r"^(renda fixa|fundo|tesouro direto)\s*[-–—]\s*\S")
_XP_LABELS = [("saldo liquido", "liquido"), ("saldo", "saldo"), ("rendimento a mercado", "rend"), ("rendimento", "rend"),
              ("vencimento", "venc"), ("rentabilidade a mercado", "rent"), ("rentabilidade (12m)", "rent"),
              ("rentabilidade", "rent"), ("resgate", "resgate"), ("cotizacao de resgate", "cot"),
              ("liquidacao de resgate", "liq")]


def _xp_label(tok: Token, page: Page) -> Optional[str]:
    if tok.x0 > 0.2 * page.width or _has_amount(tok):
        return None
    f = fold(tok.text)
    for name, key in _XP_LABELS:
        if f == name:
            return key
    for name, key in _XP_LABELS:
        if len(f) >= 4 and abs(len(f) - len(name)) <= 2 and difflib.SequenceMatcher(None, f, name).ratio() >= 0.84:
            return key
    return None


def _xp_header(page: Page) -> Optional[Tuple[Token, str]]:
    best = None
    for t in page.tokens:
        f = fold(t.text)
        if f in _XP_SECTIONS and t.cy < 0.14 * page.height and t.x0 < 0.3 * page.width:
            if best is None or t.h > best[0].h:
                best = (t, _XP_SECTIONS[f])
    return best


def parse_xp_list(page: Page) -> Optional[Screen]:
    head = _xp_header(page)
    if not head:
        return None
    header, section = head
    W, H = page.width, page.height
    body = [t for t in page.tokens if t.y0 >= header.y1 - 1]
    labels = [(t, _xp_label(t, page)) for t in body]
    labels = [(t, k) for t, k in labels if k]
    subtypes = [t for t in body if _XP_SUBTYPE.match(fold(t.text)) and t.x0 < 0.2 * W]
    meus = [t for t in body if fold(t.text) == "meus ativos"]
    if not labels and not subtypes and not meus:
        return None
    scr = Screen(page=page.name, inst="XP", kind="xp_list", score=90, date_hint=_date_hint(page))

    # header total + count (only on the first print of each list)
    if meus:
        top = [t for t in body if t.y1 <= meus[0].y0 and _has_amount(t)]
        if top:
            big = max(top, key=lambda t: t.h)
            r = reading_of(page, big)
            count = None
            for t in body:
                m = re.search(r"(\d+)\s*ativo", fold(t.text))
                if m:
                    count = int(m.group(1))
            if r:
                scr.totals.append(Total(key=section, label="Total da lista", reading=r, count=count))

    # titles: the line right above each "Renda Fixa - X" / "Fundo - X" line
    titles: List[Tuple[Token, Token]] = []
    for s in subtypes:
        above = [t for t in body if t is not s and 0 <= s.y0 - t.y1 <= 2.5 * s.h and abs(t.x0 - s.x0) <= 0.03 * W
                 and not _xp_label(t, page)]
        if above:
            titles.append((max(above, key=lambda t: t.y1), s))
    titles.sort(key=lambda p: p[0].y0)

    floor = max([t.y1 for t in meus] + [header.y1])
    bounds: List[Tuple[float, float, Optional[Token], Optional[Token]]] = []
    first_y = titles[0][0].y0 if titles else H + 1
    if any(floor <= t.y0 < first_y for t, _ in labels):
        bounds.append((floor, first_y, None, None))          # a card whose top is above this print
    for i, (t, s) in enumerate(titles):
        y1 = titles[i + 1][0].y0 if i + 1 < len(titles) else H + 1
        bounds.append((t.y0, y1, t, s))

    for order, (y0, y1, title, sub) in enumerate(bounds):
        region = [t for t in body if y0 <= t.cy < y1]
        card = Card(page=page.name, inst="XP", section=section, order=order,
                    title=_clean_title(title.text) if title else "", subtype=sub.text.strip() if sub else "",
                    box=(0, y0, W, min(y1, H)))
        seen = set()
        for lt, key in [(t, k) for t, k in labels if y0 <= t.cy < y1]:
            if key in seen:
                continue
            val = _right_value(page, lt, region)
            if val is None:
                continue
            seen.add(key)
            if key in ("saldo", "liquido", "rend"):
                r = reading_of(page, val)
                if r:
                    if key == "saldo":
                        card.value = r
                    else:
                        card.fields[key] = r
            elif key == "venc":
                d = find_date(val.text)
                if d:
                    card.fields["venc"] = d
            elif key == "rent":
                card.fields["rent"] = val.text.strip()
        if card.value is None and title is not None:
            # "Saldo" label unreadable: take the first amount in the value column, flagged as a guess
            col = sorted([t for t in region if _has_amount(t) and t.x1 > 0.6 * W and t.y0 > sub.y1], key=lambda t: t.y0)
            has_rows = any(k in ("liquido", "rend", "venc") for _, k in [(t, k) for t, k in labels if y0 <= t.cy < y1])
            if col and has_rows and not any(k == "saldo" for t, k in labels if y0 <= t.cy < y1):
                card.value = reading_of(page, col[0], guessed=True)
        if card.title or card.value or card.fields:
            scr.cards.append(card)
    return scr


def parse_xp_home(page: Page) -> Optional[Screen]:
    lab = _find(page, r"total investido \+ conta investimento")
    if not lab:
        return None
    scr = Screen(page=page.name, inst="XP", kind="xp_home", score=95, date_hint=_date_hint(page))
    tok = _below_amount(page, lab[0], max_gap=6)
    r = reading_of(page, tok) if tok else None
    if r:
        scr.totals.append(Total(key="xp.all", label="Total investido + conta", reading=r))
    else:
        scr.notes.append("Não achei o total na tela inicial da XP")
    return scr


# ---------------------------------------------------------------- Nubank

def _nu_footer(page: Page) -> Tuple[Optional[Reading], float]:
    """'Saldo disponível' bar pinned at the bottom: the amount and where the bar starts."""
    lab = _find(page, r"^saldo disponivel$")
    if not lab:
        return None, page.height + 1
    L = lab[0]
    cands = [t for t in page.tokens if _has_amount(t) and 0 <= L.y0 - t.y0 <= 4 * L.h and abs(t.x0 - L.x0) <= 0.05 * page.width]
    if not cands:
        return None, L.y0
    tok = max(cands, key=lambda t: t.y0)
    return reading_of(page, tok), tok.y0 - 1


def _nu_free_card(page: Page, r: Reading) -> Card:
    return Card(page=page.name, inst="Nubank", section="nu.livre", title="Saldo disponível", value=r, asset="Livre",
                classification="Renda Fixa", box=(0, r.box[1], page.width, page.height), order=99)


def _nu_cards(page: Page, section: str, title_ok, ceil_y: float) -> List[Card]:
    W = page.width
    body = [t for t in page.tokens if t.y1 <= ceil_y]
    titles = sorted([t for t in body if title_ok(t)], key=lambda t: t.y0)
    cards: List[Card] = []
    for i, t in enumerate(titles):
        y1 = titles[i + 1].y0 if i + 1 < len(titles) else ceil_y
        region = [x for x in body if t.y0 <= x.cy < y1 and x is not t]
        card = Card(page=page.name, inst="Nubank", section=section, title=_clean_title(t.text), order=i,
                    box=(0, t.y0, W, y1))
        below = sorted([x for x in region if x.y0 >= t.y1 - 2 and abs(x.x0 - t.x0) <= 0.03 * W], key=lambda x: x.y0)
        if below and not _has_amount(below[0]) and below[0].y0 - t.y1 < 2 * t.h:
            card.subtype = below[0].text.strip()
        # the asset value: the amount standing alone on the left, under the title
        left = [x for x in region if _has_amount(x) and x.x0 < 0.2 * W and re.match(r"^\s*R\s?\$", x.text)]
        left = [x for x in left if not any(same_row(x, o) and o.x0 < x.x0 for o in region if o is not x)]
        if left:
            card.value = reading_of(page, min(left, key=lambda x: x.y0))
        for x in region:
            f = fold(x.text)
            if x.x0 > 0.2 * W or _has_amount(x):
                continue
            val = _right_value(page, x, region)
            if val is None:
                continue
            if f == "vencimento":
                d = find_date(val.text)
                if d:
                    card.fields["venc"] = d
            elif f in ("rendeu em 12 meses", "rendimento bruto"):
                r = reading_of(page, val)
                if r:
                    card.fields["rend"] = r
            elif f == "valor aplicado":
                r = reading_of(page, val)
                if r:
                    card.fields["aplicado"] = r
            elif f == "quantidade":
                card.fields["qty"] = re.sub(r"\D", "", val.text)
        cards.append(card)
    return cards


_NU_TD_TITLE = re.compile(r"^[tli1]esouro\s+(prefixado|ipca|selic|renda|educa|igpm)")
_TICKER = re.compile(r"^([A-Z][A-Z0-9]{3}\d{1,2})\s*[•·∙\-.:*+°«»]\s*\S")   # bullets: other readers see * or +


def parse_nubank_td(page: Page) -> Optional[Screen]:
    W = page.width
    head = _find(page, r"meus titulos do tesouro direto")
    is_title = lambda t: bool(_NU_TD_TITLE.match(fold(t.text))) and t.x0 < 0.2 * W  # noqa: E731
    titles = [t for t in page.tokens if is_title(t)]
    marks = _find(page, r"^rendeu em 12 meses$") and _find(page, r"^vencimento$")
    if not head and not (titles and marks):
        return None
    scr = Screen(page=page.name, inst="Nubank", kind="nubank_td", score=95 if head else 85, date_hint=_date_hint(page))
    free, ceil_y = _nu_footer(page)
    if head:
        top = [t for t in page.tokens if t.y1 <= head[0].y0 and _has_amount(t)]
        if top:
            r = reading_of(page, max(top, key=lambda t: t.h))
            m = re.search(r"\((\d+)\)", head[0].text)
            if r:
                scr.totals.append(Total(key="nu.td", label="Total em Tesouro Direto", reading=r,
                                        count=int(m.group(1)) if m else None))
    scr.cards = _nu_cards(page, "nu.td", is_title, ceil_y)
    if free:
        scr.cards.append(_nu_free_card(page, free))
    return scr


def parse_nubank_bolsa(page: Page) -> Optional[Screen]:
    W = page.width
    head = _find(page, r"meus ativos da bolsa")
    tot = _find(page, r"^total em bolsa de valores$")
    is_title = lambda t: bool(_TICKER.match(t.text.strip())) and t.x0 < 0.4 * W  # noqa: E731
    titles = [t for t in page.tokens if is_title(t)]
    marks = _find(page, r"^quantidade$") and _find(page, r"^preco medio$")
    if not head and not tot and not (titles and marks):
        return None
    scr = Screen(page=page.name, inst="Nubank", kind="nubank_bolsa", score=95 if (head or tot) else 85,
                 date_hint=_date_hint(page))
    free, ceil_y = _nu_footer(page)
    if tot:
        tok = _below_amount(page, tot[0], max_gap=4)
        r = reading_of(page, tok) if tok else None
        count = None
        if head:
            m = re.search(r"\((\d+)\)", head[0].text)
            count = int(m.group(1)) if m else None
        if r:
            scr.totals.append(Total(key="nu.bolsa", label="Total em Bolsa de Valores", reading=r, count=count))
    cards = _nu_cards(page, "nu.bolsa", is_title, ceil_y)
    for c in cards:
        m = _TICKER.match(c.title)
        c.fields["ticker"] = m.group(1) if m else ""
        ap, rd = c.fields.get("aplicado"), c.fields.get("rend")
        if c.value and ap and rd:
            c.internal_ok = same(ap.value - abs(rd.value), c.value.value) or same(ap.value + abs(rd.value), c.value.value)
    scr.cards = cards
    if free:
        scr.cards.append(_nu_free_card(page, free))
    return scr


def parse_nubank_home(page: Page) -> Optional[Screen]:
    cart = _find(page, r"^minha carteira$")
    caix = _find(page, r"^caixinhas\b")
    if not cart or not caix:
        return None
    scr = Screen(page=page.name, inst="Nubank", kind="nubank_home", score=95, date_hint=_date_hint(page))
    tok = _below_amount(page, cart[0])
    r = reading_of(page, tok) if tok else None
    if r:
        scr.totals.append(Total(key="nu.carteira", label="Minha carteira", reading=r))
    tok = _below_amount(page, caix[0])
    r = reading_of(page, tok) if tok else None
    if r:
        m = re.search(r"\((\d+)\)", caix[0].text)
        scr.cards.append(Card(page=page.name, inst="Nubank", section="nu.caixinhas", title=caix[0].text.strip(), value=r,
                              asset="Caixinhas", classification="Renda Fixa",
                              box=(0, caix[0].y0, page.width, r.box[3]), fields={"n": m.group(1) if m else ""}))
    else:
        scr.notes.append("Não achei o valor das Caixinhas")
    ti = _find(page, r"^total investido$")
    if ti:
        tok = _below_amount(page, ti[0])
        r = reading_of(page, tok) if tok else None
        if r:
            scr.totals.append(Total(key="nu.all", label="Total investido", reading=r))
    return scr


# ---------------------------------------------------------------- one-value screens

def _simple(page: Page, inst: str, kind: str, asset: str, classification: str, label_rx: str, score: int,
            parts_rx: str = "") -> Optional[Screen]:
    lab = _find(page, label_rx)
    if not lab:
        return None
    scr = Screen(page=page.name, inst=inst, kind=kind, score=score, date_hint=_date_hint(page))
    tok = _below_amount(page, lab[0])
    r = reading_of(page, tok) if tok else None
    if not r:
        scr.notes.append(f"Reconheci a tela ({inst}) mas não achei o valor")
        return scr
    card = Card(page=page.name, inst=inst, section=f"simple.{kind}", title=lab[0].text.strip(), value=r, asset=asset,
                classification=classification, box=(0, lab[0].y0, page.width, r.box[3]))
    if parts_rx:
        parts = []
        for t in page.tokens:
            if t is tok or t.y0 <= r.box[3]:
                continue
            if re.search(parts_rx, fold(t.text)) and _has_amount(t):
                pr = reading_of(page, t)
                if pr:
                    parts.append(pr)
        if parts:
            card.fields["parts"] = parts
            card.internal_ok = same(sum(p.value for p in parts), r.value)
    scr.cards.append(card)
    return scr


def parse_itau(page: Page) -> Optional[Screen]:
    f = fold(" ".join(t.text for t in page.tokens))
    if "cofrinho" not in f:
        return None
    scr = _simple(page, "Itaú", "itau", "Cofrinhos", "Renda Fixa", r"^(total|dinheiro) guardado$", 90)
    if not scr or not scr.cards:
        return scr
    card = scr.cards[0]
    meus = _find(page, r"^meus cofrinhos$")
    if meus:
        items = [t for t in page.tokens if t.y0 > meus[0].y1 and t.x0 < 0.3 * page.width and re.match(r"^\s*R\s?\$", t.text)]
        parts = [r for r in (reading_of(page, t) for t in items) if r]
        if parts:
            card.fields["parts"] = parts
            card.internal_ok = same(sum(p.value for p in parts), card.value.value)
    return scr


def parse_mercado_pago(page: Page) -> Optional[Screen]:
    f = fold(" ".join(t.text for t in page.tokens))
    if not (("mercado pago" in f or "meli+" in f) and "cofrinho" in f):
        return None
    scr = Screen(page=page.name, inst="Mercado Pago", kind="mercado_pago", score=90, date_hint=_date_hint(page))
    amts = [t for t in page.tokens if _has_amount(t)]
    if not amts:
        scr.notes.append("Reconheci o Mercado Pago mas não achei o valor")
        return scr
    head = max(amts, key=lambda t: t.h)
    hr = reading_of(page, head)
    # items listed under the headline, value on the right ("Investimento ... R$ 38.784,66")
    items = [t for t in amts if t is not head and t.y0 > head.y1 and t.x1 > 0.55 * page.width and t.h < 0.8 * head.h]
    parts = [r for r in (reading_of(page, t) for t in items) if r and r.value > 0]
    total = sum(p.value for p in parts)
    card = Card(page=page.name, inst="Mercado Pago", section="simple.mercado_pago", title="Cofrinhos", asset="Cofrinhos",
                classification="Renda Fixa", box=(0, head.y0, page.width, max([head.y1] + [p.box[3] for p in parts])))
    if parts and all(p.solid for p in parts) and (hr is None or not hr.solid):
        # the headline prints the cents as superscript, which reads badly: trust the itemised lines
        card.value = Reading(value=total, page=page.name, box=parts[-1].box if len(parts) == 1 else card.box, strict=True,
                             agreed=all(p.agreed for p in parts) if all(p.agreed is not None for p in parts) else None)
        card.fields["parts"] = parts
        card.internal_ok = True if (hr and same(hr.value, total)) else None
    elif hr:
        card.value = hr
        if parts:
            card.fields["parts"] = parts
            card.internal_ok = same(total, hr.value)
    scr.cards.append(card)
    return scr


def parse_brasilprev(page: Page) -> Optional[Screen]:
    if "brasilprev" not in fold(" ".join(t.text for t in page.tokens)):
        return None
    return _simple(page, "Brasilprev", "brasilprev", "PGBL Empresarial", "Previdência", r"^saldo total$", 90)


def parse_icatu(page: Page) -> Optional[Screen]:
    f = fold(" ".join(t.text for t in page.tokens))
    if "icatu" not in f and "onze" not in f:
        return None
    return _simple(page, "Onze", "icatu", "Previdência Icatu", "Previdência",
                   r"patrimonio total|^saldo acumulado$", 90, parts_rx=r"investido nesse plano")


def parse_fgts(page: Page) -> Optional[Screen]:
    if "fgts" not in fold(" ".join(t.text for t in page.tokens)):
        return None
    return _simple(page, "Caixa", "fgts", "FGTS", "Renda Fixa", r"^saldo total$", 90)


# ---------------------------------------------------------------- recognise

PARSERS = [parse_xp_home, parse_xp_list, parse_nubank_home, parse_nubank_td, parse_nubank_bolsa, parse_mercado_pago,
           parse_itau, parse_brasilprev, parse_icatu, parse_fgts]

INSTITUTIONS = ["Nubank", "XP", "Itaú", "Mercado Pago", "Caixa", "Onze", "Brasilprev"]


def loose_amounts(page: Page) -> List[Reading]:
    out = []
    for t in page.tokens:
        for i in range(len(find_amounts(t.text))):
            r = reading_of(page, t, which=i)
            if r:
                out.append(r)
    return out


def recognise(page: Page, force_inst: str = "") -> Screen:
    """Best reading of one print. inst == '' means: could not tell which bank/screen this is."""
    if page.error:
        return Screen(page=page.name, notes=[page.error])
    found: List[Screen] = []
    for parser in PARSERS:
        try:
            scr = parser(page)
        except Exception as e:  # a parser bug must never take the whole run down
            scr = None
            found.append(Screen(page=page.name, notes=[f"Erro ao ler esta tela: {e}"]))
        if scr and scr.inst:
            found.append(scr)
    if force_inst:
        forced = [s for s in found if s.inst == force_inst]
        found = forced or []
    ranked = sorted([s for s in found if s.inst], key=lambda s: -s.score)
    if not ranked:
        scr = Screen(page=page.name)
        scr.loose = loose_amounts(page)
        scr.date_hint = _date_hint(page)
        return scr
    best = ranked[0]
    rivals = [s for s in ranked[1:] if s.inst != best.inst and s.score >= best.score - 10]
    if rivals:
        best.rival = rivals[0].inst
    best.loose = loose_amounts(page)
    return best
