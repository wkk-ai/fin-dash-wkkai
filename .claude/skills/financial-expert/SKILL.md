---
name: financial-expert
description: Rules for judging if a stock is cheap: indicators, formulas, thresholds, scoring, sector cases and value-trap flags, drawn from William's finance library. Use for stock screening, valuation or explaining indicators.
---

# Financial expert — how to judge if a stock is cheap

Use this before writing any screening rule, score, fair-value formula or explanation in the stock-picker app (github.com/wkk-ai/stock-picker, `pipeline/score.py`), or when answering valuation questions. Formulas: appendix. Full chapter-by-chapter notes of the books read cover to cover: `references/books/*.md`.

Read in full (every page): Graham, *O Investidor Inteligente* (with Zweig comments); Koller/Goedhart/Wessels, *Valuation* (McKinsey); Rosenbaum & Pearl, *Investment Banking*; GBP course decks (Valuation, Análise de DFs, FCV). Other ~55 texts in the library were only scanned for valuation passages.

## 1. Core principles

1. **Price is not value.** A stock is cheap only against the cash it will earn and the risk of that cash. A low multiple alone proves nothing (Graham ch. 1, 20; McKinsey ch. 1-3).
2. **Value = ROIC above cost of capital, times reinvestment.** Growth adds value only if return on new capital > WACC; at ROIC = WACC growth is worth zero (McKinsey value driver formula). A cheap stock with ROIC ≤ WACC is usually priced right — a value trap.
3. **Margin of safety.** Buy at ≤ 2/3 of a conservative value (Graham "60-cent dollar"); for a DCF-based fair value ask ≥ 15-20% gap. Earnings yield (1/PE) should beat high-grade bond yield (Graham ch. 14).
4. **Compare like with like.** Rank within sub-industry and market; never mix B3 with S&P 500 peers (rates, inflation, liquidity differ). Use the median, not the mean; drop peers with depressed/negative earnings (Rosenbaum ch. 1; McKinsey multiples chapter).
5. **Normalize earnings.** Graham: 3-yr average EPS for P/E, 7-10 yr average for long view. McKinsey: mid-cycle margins for cyclicals; never peak or trough. Strip one-offs (asset-sale gains, impairments, provision reversals, tax credits) before any multiple (Rosenbaum; GBP DFs: one-offs lifted a BR net margin from 16% to 26%).
6. **Balance sheet first.** Weak liquidity or heavy debt makes "cheap" dangerous (Graham defensive tests; Rosenbaum credit stats).
7. **Returns come from changes in expectations.** A great company at a full price gives an ordinary return (McKinsey). Behavior (Mr. Market, herding, overconfidence) is the investor's main enemy (Graham ch. 8).

## 2. Which multiple

- **Primary: EV/EBIT(A)** — after D&A so capex burden counts; independent of capital structure; excludes nonoperating items (McKinsey: beats P/E and EV/EBITDA).
- **EV/EBITDA**: only among firms with similar asset intensity (own vs lease vs outsource distorts it); Rosenbaum's banker default.
- **P/E**: secondary; distorted by leverage, cash piles (cash earning ~2% after tax implies P/E ~50), buybacks and one-offs. Never with EPS ≤ 0.
- **P/B**: read only together with ROE (justified P/B = (ROE − g)/(ke − g)). Main tool for banks.
- **P/S**: fallback for loss-makers with similar margins. **PEG**: flawed (ignores ROIC).
- Forward beats trailing for accuracy (McKinsey: median error 23% trailing vs 16% 2-yr forward) but haircut analyst optimism; our data is trailing, so normalize.
- Sector-specific: EV/EBITDAR (retail, airlines), EV/EBITDAX (oil & gas), P/FFO (REITs), NAV (holdings, real estate) — Rosenbaum.

## 3. Numeric rules with source

| Rule | Threshold | Source |
|---|---|---|
| Defensive P/E | price ≤ 15 × 3-yr average EPS | Graham ch. 14 |
| Defensive P/B | ≤ 1.5, or P/E × P/B ≤ 22.5 | Graham ch. 14 |
| Defensive strength | current ratio ≥ 2; long-term debt ≤ net working capital; utilities debt ≤ 2× equity | Graham ch. 14 |
| Defensive record | profit every year for 10 yrs; dividends 20 yrs (Zweig: 10 ok); EPS +1/3 in 10 yrs on 3-yr averages (Zweig: +50%) | Graham ch. 14 |
| Enterprising screen | P/E ≤ 9; current ratio ≥ 1.5; debt ≤ 110% of net current assets; no loss in 5 yrs; some dividend; EPS > 5 yrs ago; price ≤ 1.2× tangible book | Graham ch. 15 |
| Net-net | price < NCAV = current assets − ALL liabilities; Graham bought ≤ 2/3 NCAV, in groups, excluding loss-makers | Graham ch. 15 |
| Graham number | √(22.5 × EPS × BVPS) | from the 22.5 rule |
| Graham formula | V = normalized EPS × (8.5 + 2g), g capped ~5-7% | Graham ch. 11 |
| Earnings yield vs bonds | E/P ≥ AA bond yield (max P/E = 1/yield) | Graham ch. 14 |
| Bond-like coverage | pre-tax earnings ≥ 5× fixed charges on 7-yr average and weakest year | Graham ch. 6, 11 |
| ROIC benchmarks (US) | median 9% ex-goodwill; >20% is top ~1/6; sector medians: pharma 18, software/household 15, retail 9, energy 7.7, utilities 6.2 | McKinsey ch. 6 |
| Coverage | EBITA/interest < 2 unsustainable; investment grade ≈ 5-11× | McKinsey ch. 17 |
| Leverage | net debt/EBITDA < 3× comfortable, 3-5× caution, > 5× LBO-like stress; EBITDA/interest < 2.5× weak, > 5× comfortable | Rosenbaum ch. 1, 4 |
| DCF sanity | terminal value ≈ 70% of EV is normal, flag > 75-80%; terminal g 2-4% real-ish, ≤ nominal GDP; WACC ± 1 pt ≈ ± 8% value | Rosenbaum ch. 3 |
| Takeover premium | precedents carry ~30-35% control premium — upper bound, not minority fair value | Rosenbaum ch. 2 |
| Market regime | fair market P/E ~15 normal, ~10 with high inflation/rates | McKinsey |
| Bazin | ceiling price = 12m dividend ÷ 6% | BR market practice |
| Magic Formula | rank EV/EBIT (low) + ROIC (high); exclude financials and utilities | Greenblatt |

## 4. Scoring method in the app

1. **Universe**: B3 with daily liquidity ≥ R$ 200 thousand; S&P 500.
2. **Data**: daily snapshot (Fundamentus, Yahoo) + multi-year statements refreshed weekly (`pipeline/history.py`): CVM DFP consolidated for Brazil (12 years); Yahoo annual statements for the US (~4 years; SEC XBRL frames give 12 years when the `SEC_CONTACT_EMAIL` secret is set).
3. **Percentiles inside market + sector** (fallback whole market if < 5 peers). Cheaper/better = higher.
4. **Value score**: EV/EBIT 25, P/B 15, EV/EBITDA 15, P/E 10, P/E on 3-yr average earnings 10, DY 10 (capped at 15%), P/FCF 8, P/S 7. Negative multiples excluded. Financials: P/B 40, P/E 20, P/E 3-yr avg 20, DY 20. Missing metric: weight redistributed.
5. **Quality score**: ROIC 30, net debt/EBITDA 15, profit stability (share of profitable years, last 10) 10, interest coverage 10, revenue growth 10, EBIT margin 8, net margin 7, operating cash ÷ net income (3 yrs) 5, current ratio 5. Financials: ROE 50, stability 25, growth 15, net margin 10.
6. **Final** = 0.6 × value + 0.4 × quality − penalties: negative equity −20, loss −15, net debt/EBITDA > 4 −10, coverage < 2 −8, P/E < 3 −8, DY > 15% −8, ROIC (ROE for banks) below cost of capital (13% BR, 8% US) −6, profit without cash (CFO/NI < 0.5) −5, cyclical margin > 1.3× its multi-year average −5, current ratio < 1 −5, ROE > 60% −5, falling revenue −5, loss in last 5 yrs −4, cyclical −3.
7. **Interest coverage in Brazil** uses NET financial expense (despesas − receitas financeiras): BR "despesas financeiras" include FX and inflation restatement and cash earns Selic, so gross coverage flagged over half the market.
8. **Graham defensive screen**: the seven ch. 14 tests (size = top third of market cap; current ratio ≥ 2 and LT debt ≤ working capital, utilities LT debt ≤ 2× equity; no loss in 10 yrs; dividend every year; NI 3-yr avg ≥ +1/3 vs 10 yrs earlier; P/E 3-yr avg ≤ 15; P/B ≤ 1.5 or P/E × P/B ≤ 22.5). Passes only if every test with data passes and at least 6 have data. Uses net income, not EPS, so dilution is not captured.
9. **Other screens**: Graham enterprising, net-net (BR only), Magic Formula, Bazin, pure value.
10. **Shown, never advice**: Graham number, Bazin ceiling, earnings yield vs Selic / US 10-yr.
11. **Verdict** (`pipeline/verdict.py`), the answer to "cheap and worth a look now?": *oportunidade* = value ≥ 60, quality ≥ 55, no grave flag (loss, negative equity, high debt, weak coverage, cycle peak), return above cost of capital, ≥ 60% of signals in favour; *barata_risco* = value ≥ 60 but fails the rest (value-trap zone); *boa_cara* = quality ≥ 65, no grave flag; *evitar* = negative equity, loss with weak quality, or both scores < 40; else *neutra*.
12. **Ten signals**, each yes/no with its number: cheap vs sector, earnings yield > risk-free, below Graham number, P/E on 3-yr earnings ≤ 15, return > cost of capital, debt under control (ND/EBITDA ≤ 3 and coverage ≥ 2), profit every year, cash conversion ≥ 0.8, consistent dividends, price above 200-day average. Price trend is context only; it never enters the value score.
13. **Five dimensions** (0–100 vs sector): valor, rentabilidade, segurança, estabilidade, tendência.

## 5. Red flags and value traps

- ROIC ≤ cost of capital with a low multiple (deserved discount). Weak ROIC persists: 43% of firms under 5% stay there 10 yrs later (McKinsey).
- Low P/E from high leverage or peak cyclical earnings; low EV/EBITDA on capex- or lease-heavy firms.
- EPS growth from buybacks, debt-funded acquisitions, asset sales, tax items; margins rising while R&D/ads/capex fall.
- Serial acquirers: ROIC with goodwill far below ROIC without; revenue synergies rarely happen.
- Dividends paid with debt (payout + reinvestment > cash flow); DY > 15%; equity issuance by a "cheap" stock.
- Hidden debt: leases, unfunded pensions, litigation/tax provisions (big in Brazil), off-balance entities, minorities, preferred.
- Earnings quality: operating cash flow far below net income; receivables or inventory growing faster than sales; "outras receitas operacionais" inflating EBIT; provisions reversed; low cash tax from deferrals.
- Hype: recent IPOs, extreme P/S with persistent losses, P/E > 25-30 built on extrapolated growth (Graham).
- Distressed, pre-profit or option-like names (biotech, exploration): screening "cheapness" is unreliable — keep them out of the ranking or flag.

## 6. Sector and market cases

- **Banks/insurers**: ROE vs cost of equity, P/B, P/E, DY. No EV, net debt, current ratio or revenue margins. Watch loan-loss provisions, efficiency ratio; insurers combined ratio. ROE ≈ ke means P/B ≈ 1.
- **Utilities/regulated**: high debt normal (D/V ~ 47% fine); judge by DY, stable ROE; Graham: debt ≤ 2× equity.
- **Cyclicals** (mining, oil, steel, pulp, chemicals, airlines): value on mid-cycle margins; peak signals = record ROIC plus rising capex and rising consensus. Coverage must hold in a downturn.
- **Retail (BR)**: captive credit-card receivables inflate receivable days (Renner case); compare like with like.
- **Holdings/dual class/conglomerates**: discount can persist without a catalyst.
- **Brazil**: use BRL nominal rates consistently (NTN-B / prefixado), not USD rf on BRL flows. McKinsey warns against stacking a big country premium on WACC — prefer a crisis scenario haircut. High Selic hurts leveraged and long-working-capital firms; floating CDI debt matters more than P/E. Statutory tax 34% (IR + CSLL); JCP needs a normalized tax rate. Inflation flatters nominal ROIC on old assets. Low-liquidity B3 stocks show artificially low betas. Tag-along and ON/PN classes matter for minority value.

## 7. Communication rules

- Say "barata pelos indicadores", never "compre". Show the metrics that drove the score and the flags.
- Show data date and source; indicators look backward.
- Educational tool, not a recommendation (CVM rules for analysts).
- Prefer ranges over single fair values; disagreement between methods is information.

## 8. Not yet in the app

Own-history multiple ranges, reverse DCF implied growth, justified EV/EBITA = (1 − T)(1 − g/ROIC)/(WACC − g), EPS-based (dilution-aware) Graham growth, lease and pension adjustments to EV, 10+ years for US without the SEC e-mail.

## Appendix — formulas

Per-share values use the latest 12 months unless noted. EV = market cap + debt + preferred + minorities − cash.

| Metric | Formula | Cheaper/better when |
|---|---|---|
| P/E | price ÷ EPS | lower, > 0 |
| Earnings yield | EPS ÷ price | higher; compare with risk-free |
| P/B | price ÷ book value per share | lower, > 0 (read with ROE) |
| EV/EBIT, EV/EBITDA | EV ÷ EBIT(DA) | lower, > 0 |
| P/FCF | market cap ÷ (CFO − capex) | lower, > 0 |
| Dividend yield | 12m DPS ÷ price | higher, cap 15% |
| ROE | net income ÷ average equity | higher (= ROIC + D/E × (ROIC − kd(1−t))) |
| NOPLAT | EBITA × (1 − operating cash tax) | |
| Invested capital | operating working capital + net PP&E + other operating assets (± goodwill) | |
| ROIC | NOPLAT ÷ average invested capital | higher than WACC |
| Economic profit | IC × (ROIC − WACC) | > 0 |
| Value driver | EV = NOPLAT × (1 − g/RONIC) ÷ (WACC − g) | |
| Justified EV/EBITA | (1 − T)(1 − g/ROIC) ÷ (WACC − g) | compare with actual |
| Justified P/B | (ROE − g) ÷ (ke − g) | banks |
| Net debt/EBITDA | (debt − cash) ÷ EBITDA | lower |
| Coverage | EBIT(A) ÷ interest | higher (≥ 5 solid, < 2 unsustainable) |
| Current ratio | current assets ÷ current liabilities | ≥ 1.5-2 |
| NCAV | current assets − total liabilities | price below it = net-net |
| Graham number | √(22.5 × EPS × BVPS) | price below it |
| Graham formula | EPS × (8.5 + 2g) | |
| Bazin ceiling | 12m DPS ÷ 0.06 | price below it |
| CAPM | ke = rf + β × ERP (ERP 4.5-5.5% global) | |
| WACC | E/V × ke + D/V × kd × (1 − t), target market weights | |
| Unlever / relever β | βU = βL ÷ (1 + (1 − t) D/E); βL = βU × (1 + (1 − t) D/E) | |
| Gordon / terminal | TV = FCF × (1 + g) ÷ (WACC − g) | g < WACC |
