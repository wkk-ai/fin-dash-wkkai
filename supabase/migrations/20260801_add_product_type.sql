-- Add product type layer between institution and asset.
-- Backfill: product_type = asset (safe; totals unchanged).

alter table public.net_worth
  add column if not exists product_type text not null default '';

update public.net_worth
set product_type = asset
where product_type is null or product_type = '';

create index if not exists net_worth_product_type_idx
  on public.net_worth (product_type);
