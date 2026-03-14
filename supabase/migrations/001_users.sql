-- Run this in your Supabase project's SQL editor (or via supabase db push).
--
-- Creates the public.users table that mirrors auth.users and stores app roles.
-- The bootstrap flow inserts the first row with role = 'admin'.

create table if not exists public.users (
  id    uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role  text not null default 'viewer'
        check (role in ('admin', 'editor', 'viewer')),
  created_at timestamptz not null default now()
);

-- Only the service-role key (used server-side) can write to this table.
-- Authenticated users can read their own row.
alter table public.users enable row level security;

create policy "users can read own row"
  on public.users for select
  using (auth.uid() = id);

create policy "service role has full access"
  on public.users for all
  using (true)
  with check (true);
