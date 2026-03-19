alter table public.dashboards add column if not exists filters jsonb not null default '[]';
