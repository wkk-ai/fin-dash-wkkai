-- Second valuation for public bonds (Tesouro Direto): "na curva".
-- value      = market value (marcação a mercado), as shown by the bank.
-- value_curve = value if the bond keeps yielding the rate it was bought at.
--               Null for anything that is not a public bond.
alter table public.net_worth add column if not exists value_curve numeric;

-- Every public bond purchase, so the curve value can be recomputed.
create table if not exists public.bond_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  institution text not null,
  bond_code text not null,
  bond_name text not null,
  kind text not null check (kind in ('princ','ntnb','ntnf','ltn','rendaplus')),
  maturity date not null,
  purchase_date date not null,
  quantity numeric not null,
  unit_price numeric not null,
  rate numeric,
  estimated boolean not null default false,
  note text,
  created_at timestamptz not null default now()
);

alter table public.bond_purchases enable row level security;

drop policy if exists "Users manage own bond purchases" on public.bond_purchases;
create policy "Users manage own bond purchases" on public.bond_purchases
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists bond_purchases_user_idx on public.bond_purchases(user_id);
