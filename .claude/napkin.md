# Napkin — mistakes and corrections (stock-picker)

- 2026-11-07: Launched 13 parallel reader agents over ~50M chars of PDFs at once; all hit the 5-hour usage limit before saving anything. Next time: extract relevant passages locally first, read in small batches, and make agents write notes after every chunk.
- 2026-11-07: Google Drive connector can't download files > ~5 MB (message too large). Use the Mac's synced Drive folder + stage files; folders deeper than 7 levels can't be staged.
- 2026-11-07: GitHub Pages on this private repo failed before ("Ensure GitHub Pages has been enabled"). Pages must be turned on in repo Settings, and private repos need GitHub Pro or the repo made public.
- Cloud sandbox and Mac VM can't reach Fundamentus/Yahoo/SEC. Test data fetching through GitHub Actions runs, not locally.
- 2026-11-14: A signal title that reads positive next to a "!" mark ("Lucro todo ano" when it failed) confuses. Failed signals need their own negative wording (SIG_NEG).
- 2026-11-14: `.kv div` also styled nested divs. Use child selectors (`.kv > div`) for grid cells.
- For UI work: pull the `data` branch, run `pipeline.dev_rebuild`, screenshot light, dark and 390px before pushing.
- 2026-11-14: `main { padding }` lost to `.wrap { padding: 0 24px }` (class beats element), so every page title sat glued to the header. Scope layout padding as `main.wrap`. William reads tight spacing as a bug: keep generous gaps (88px between sections).
- 2026-11-14: Ratios on a tiny base explode (5-year profit growth of 77%, index charts starting on a near-zero year, payout "best = 0%"). Cap or pick a sane base before ranking or charting.
- Any chart or list must respect the global filters (`filtered()`), never `inMarket()` directly.

- 2026-11-15: Stock screener merged into this repo (Ações page). Its screens are plain JS in `stocks/src`, bundled to `public/stocks/app.js`; the page shell is `app/stocks/page.tsx`; styles in `app/stocks/stocks.css` must use the dashboard tokens (surface, border, primary), never a second look.
- 2026-11-15: Hash links inside a Next page create history entries without router state, so Back from another page did nothing. Copy `history.state` onto them (see `app/stocks/page.tsx`).
- The sandbox cannot reach Google Fonts, so `next build` fails locally on `next/font`. Stub the font in `app/layout.tsx` for a local build only and restore it; CI builds fine. Icons render as text in local screenshots for the same reason.
- To see logged-in pages without a password: Playwright with a fake `sb-<ref>-auth-token` in localStorage and `route()` mocks for `supabase.co`. Never add an auth bypass to the app.
