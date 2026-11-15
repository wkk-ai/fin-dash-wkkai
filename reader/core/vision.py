"""Read a screenshot with Apple's text recognition, keeping where each piece of text is.

Two independent engines are run when available (Vision and Live Text). The
second one is only used to double-check numbers: when both read the same
amount at the same place, the amount is trusted.

Mac only (needs the `ocrmac` package). Coordinates are pixels, origin top-left.
"""
from __future__ import annotations

import hashlib
import io
import json
import os
import tempfile
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Union


LANGS = ["pt-BR", "en-US"]


@dataclass
class Token:
    text: str
    x0: float
    y0: float
    x1: float
    y1: float
    conf: float = 1.0

    @property
    def cx(self) -> float:
        return (self.x0 + self.x1) / 2

    @property
    def cy(self) -> float:
        return (self.y0 + self.y1) / 2

    @property
    def h(self) -> float:
        return self.y1 - self.y0

    @property
    def w(self) -> float:
        return self.x1 - self.x0


@dataclass
class Page:
    name: str
    width: int
    height: int
    tokens: List[Token] = field(default_factory=list)
    alt_tokens: List[Token] = field(default_factory=list)  # second engine (may be empty)
    sha1: str = ""
    error: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name, "width": self.width, "height": self.height, "sha1": self.sha1,
            "error": self.error,
            "tokens": [asdict(t) for t in self.tokens],
            "alt_tokens": [asdict(t) for t in self.alt_tokens],
        }

    @staticmethod
    def from_dict(d: Dict[str, Any]) -> "Page":
        return Page(
            name=d.get("name") or d.get("file") or "", width=int(d.get("width") or 0), height=int(d.get("height") or 0),
            sha1=d.get("sha1") or "", error=d.get("error") or "",
            tokens=[Token(**t) for t in d.get("tokens") or []],
            alt_tokens=[Token(**t) for t in d.get("alt_tokens") or []],
        )


def _to_tokens(results) -> List[Token]:
    out = []
    for item in results or []:
        try:
            text, conf, box = item[0], item[1], item[2]
            x0, y0, x1, y1 = [float(v) for v in box]
        except Exception:
            continue
        text = str(text).strip()
        if text:
            out.append(Token(text=text, x0=min(x0, x1), y0=min(y0, y1), x1=max(x0, x1), y1=max(y0, y1), conf=float(conf or 0)))
    return out


def read_page(source: Union[str, Path, bytes], name: str = "") -> Page:
    """OCR one image. Never raises: problems come back in Page.error."""
    try:
        raw = Path(source).read_bytes() if isinstance(source, (str, Path)) else bytes(source)
        name = name or (Path(source).name if isinstance(source, (str, Path)) else "imagem")
        from PIL import Image  # only the Mac version reads images itself; the browser sends readings
        img = Image.open(io.BytesIO(raw))
        img.load()
        img = img.convert("RGB")
    except Exception as e:  # not an image, truncated file...
        return Page(name=name or "imagem", width=0, height=0, error=f"Não consegui abrir a imagem ({e})")
    page = Page(name=name, width=img.width, height=img.height, sha1=hashlib.sha1(raw).hexdigest())
    fake = os.environ.get("FR_FAKE_PAGES")      # tests and demos: use saved readings instead of the Mac's OCR
    if fake:
        f = Path(fake) / f"{name}.json"
        if f.is_file():
            saved = Page.from_dict(json.loads(f.read_text(encoding="utf-8")))
            page.tokens, page.alt_tokens = saved.tokens, saved.alt_tokens
            page.width, page.height = saved.width or page.width, saved.height or page.height
        else:
            page.error = "Nenhum texto encontrado na imagem"
        return page
    try:
        from ocrmac import ocrmac
    except Exception as e:
        page.error = f"Leitor de texto do Mac indisponível ({e}). Rode pelo start.command."
        return page
    tmp: Optional[str] = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as fh:
            img.save(fh.name)
            tmp = fh.name
        try:
            res = ocrmac.OCR(tmp, framework="vision", recognition_level="accurate", language_preference=LANGS).recognize(px=True)
            page.tokens = _to_tokens(res)
        except Exception as e:
            page.error = f"Falha ao ler o texto ({e})"
        try:
            res2 = ocrmac.OCR(tmp, framework="livetext", language_preference=LANGS, unit="line").recognize(px=True)
            page.alt_tokens = _to_tokens(res2)
        except Exception:
            page.alt_tokens = []  # Live Text not on this macOS: fine, it is only a second opinion
    finally:
        if tmp:
            Path(tmp).unlink(missing_ok=True)
    if not page.tokens and not page.error:
        page.error = "Nenhum texto encontrado na imagem"
    return page


# ---------------------------------------------------------------- isolated reader
# Apple's text recognition wants to run on a program's main thread, and a crash inside it
# must not take the app down. So the app keeps one small helper process just for reading.

class Reader:
    def __init__(self, root: Union[str, Path], timeout: float = 90.0):
        self.root = str(root)
        self.timeout = timeout
        self.proc = None

    def _start(self) -> None:
        import subprocess
        import sys
        self.proc = subprocess.Popen([sys.executable, "-m", "core.vision"], cwd=self.root, stdin=subprocess.PIPE,
                                     stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, encoding="utf-8")

    def stop(self) -> None:
        if self.proc is not None:
            try:
                self.proc.kill()
            except Exception:
                pass
            self.proc = None

    def read(self, path: Union[str, Path], name: str) -> Page:
        """Read one image file. Falls back to reading in-process if the helper cannot be used."""
        import select
        if os.environ.get("FR_FAKE_PAGES"):
            return read_page(path, name=name)
        for attempt in range(2):
            try:
                if self.proc is None or self.proc.poll() is not None:
                    self._start()
                self.proc.stdin.write(json.dumps({"path": str(path), "name": name}) + "\n")
                self.proc.stdin.flush()
                ready, _, _ = select.select([self.proc.stdout], [], [], self.timeout)
                if not ready:
                    self.stop()
                    return Page(name=name, width=0, height=0, error="A leitura deste print demorou demais")
                line = self.proc.stdout.readline()
                if not line:
                    self.stop()
                    continue        # helper died: start a new one and try once more
                return Page.from_dict(json.loads(line))
            except Exception:
                self.stop()
        return read_page(path, name=name)


def _serve() -> None:
    import sys
    for line in sys.stdin:
        try:
            req = json.loads(line)
            page = read_page(req["path"], name=req.get("name") or "")
        except Exception as e:
            page = Page(name="", width=0, height=0, error=f"Falha ao ler o texto ({e})")
        sys.stdout.write(json.dumps(page.to_dict(), ensure_ascii=False) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    _serve()
