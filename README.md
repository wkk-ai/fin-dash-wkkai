# FinTrack

One personal finance app, published at https://wkk-ai.github.io/fin-dash-wkkai/ (login required).

| Section | What it does | Where it lives |
|---|---|---|
| Dashboard, Carteira, Movimentações, Configurações | Net worth, holdings, movements, budgets, imports | `app/`, `components/`, `lib/` (Next.js, Supabase with row-level security) |
| Fechamento | Drop the month's bank screenshots; it reads them, checks each list against the totals the bank shows, and loads the month into the portfolio | `app/import/` (page), `reader-ui/app.js` (screens, text reading with Tesseract), `reader/` (checking engine in Python, run in the browser by Pyodide). Screenshots never leave the device. |
| Ações | Which Brazilian and US stocks are cheap and good today, with the reasons | `app/stocks/` (page shell and styles), `stocks/src/` (screens and charts, plain JS), `pipeline/` (daily data, Python) |

## How the stock data gets there

1. `.github/workflows/deploy.yml` runs on every push and every weekday after the B3 close.
2. On the daily run it executes `python -m pipeline.run`: Fundamentus (B3), Yahoo Finance (S&P 500, prices), Banco Central (Selic, IPCA), plus the multi-year statements in `pipeline/data/fundamentals.json` (refreshed weekly by `stocks-history.yml` from CVM and SEC).
3. The result is written to `public/stocks/data/` (never committed), saved to the `stocks-data` branch, and published with the site. A push reuses the last snapshot, so code changes deploy in about two minutes.
4. If the repository secret `DATABASE_URL` is set, each run also stores the daily history in Neon Postgres.

Scoring rules are documented in `.claude/skills/financial-expert/SKILL.md`.

## Run locally

```bash
npm ci
npm run dev        # http://localhost:3000
```

Stock data for local work: `git fetch origin stocks-data && mkdir -p public/stocks/data && git archive FETCH_HEAD | tar -x -C public/stocks/data`.

## Fechamento (print reader)

- Text recognition runs in the browser (Tesseract, Portuguese). Each amount is read twice (whole screen, then the amount alone); when the readings disagree the app asks.
- The checking engine (`reader/core`) is the same one the old Mac app used; `python3 -m pytest reader/tests` runs its tests (some need the private October readings and skip without them).
- `npm run assets` copies the engine, Pyodide and Tesseract into `public/reader/` (all served from this site, no CDN).
- Lines with no screenshot (kept every month) are saved per user in the `reader_settings` table.

## Privacy

Personal data lives only in Supabase, behind login and row-level security. Nothing personal belongs in this repository: no exports, no screenshots, no mockups with real values (`*.csv`, `*.xlsx` and `/data/` are ignored).
