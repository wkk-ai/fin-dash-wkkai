"""Local development: rebuild public/stocks/data from a saved snapshot (the repo's `data` branch) without fetching anything.

  git fetch --depth=1 origin data:refs/remotes/origin/data
  mkdir -p /tmp/snap && git archive origin/data | tar -x -C /tmp/snap
  python -m pipeline.dev_rebuild /tmp/snap
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import pandas as pd

from pipeline import prices, verdict
from pipeline.run import OUT, to_records
from pipeline.score import score


def main(snap: str) -> None:
    src = Path(snap)
    recs = json.loads((src / "stocks.json").read_text())
    meta = json.loads((src / "meta.json").read_text())
    df = pd.DataFrame(recs)
    st = prices.stats(list(df["ticker"]), src / "prices")
    for k in ("ret_12m", "vs_ma200", "pos_52w", "lo_52w", "hi_52w", "spark"):
        df[k] = df["ticker"].map(lambda t, k=k: st.get(t, {}).get(k))
    df = score(df)
    df = verdict.apply(df, meta.get("macro", {}))
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "stocks.json").write_text(json.dumps(to_records(df.sort_values("final_score", ascending=False)), ensure_ascii=False, separators=(",", ":")))
    for f in ("meta.json", "series.json", "history.json"):
        shutil.copy(src / f, OUT / f)
    if (src / "prices").exists():
        shutil.copytree(src / "prices", OUT / "prices", dirs_exist_ok=True)
    for m in ("BR", "US"):
        print(m, df[df["market"] == m]["verdict"].value_counts().to_dict())


if __name__ == "__main__":
    main(sys.argv[1])
