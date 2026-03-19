alter table public.user_settings add column if not exists safe_mode boolean not null default false;
