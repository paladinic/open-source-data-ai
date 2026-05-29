alter table public.dashboards
  add column if not exists widgets jsonb not null default '[]'::jsonb;
