# FinTrack

One personal finance app, published at https://wkk-ai.github.io/fin-dash-wkkai/ (login required).

| Section | What it does | Where it lives |
|---|---|---|
| Dashboard, Carteira, Movimentações, Configurações | Net worth, holdings, movements, budgets, imports | `app/`, `components/`, `lib/` (Next.js, Supabase with row-level security) |
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

## Privacy

Personal data lives only in Supabase, behind login and row-level security. Nothing personal belongs in this repository: no exports, no screenshots, no mockups with real values (`*.csv`, `*.xlsx` and `/data/` are ignored).
