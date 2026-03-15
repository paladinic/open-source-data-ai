-- Data tables for projects, components, dashboards and chat messages.
-- All writes go through the backend service-role key (bypasses RLS).

-- ── Projects ──────────────────────────────────────────────────────────────────

create table if not exists public.projects (
  id          text        primary key,
  name        text        not null,
  description text        not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.projects enable row level security;

create policy "service role full access" on public.projects
  for all using (true) with check (true);


-- ── Components ────────────────────────────────────────────────────────────────

create table if not exists public.components (
  id            text        primary key,
  project_id    text        not null references public.projects (id) on delete cascade,
  name          text        not null,
  type          text        not null check (type in ('etl', 'visualisation')),
  description   text        not null default '',
  code          text        not null default '',
  config        jsonb       not null default '{}',
  depends_on    text[]      not null default '{}',
  output_schema text[]      not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.components enable row level security;

create policy "service role full access" on public.components
  for all using (true) with check (true);


-- ── Dashboards ────────────────────────────────────────────────────────────────

create table if not exists public.dashboards (
  id         text        primary key,
  project_id text        not null references public.projects (id) on delete cascade,
  name       text        not null,
  layout     text[]      not null default '{}',
  positions  jsonb       not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dashboards enable row level security;

create policy "service role full access" on public.dashboards
  for all using (true) with check (true);


-- ── Messages ──────────────────────────────────────────────────────────────────

create table if not exists public.messages (
  id           text        primary key,
  project_id   text        not null references public.projects (id) on delete cascade,
  component_id text        references public.components (id) on delete cascade,
  role         text        not null check (role in ('user', 'assistant')),
  content      text        not null,
  created_at   timestamptz not null default now()
);

alter table public.messages enable row level security;

create policy "service role full access" on public.messages
  for all using (true) with check (true);
