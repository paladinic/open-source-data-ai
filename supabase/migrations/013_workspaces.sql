-- ── Workspaces ────────────────────────────────────────────────────────────────
-- Note: app-managed IDs (projects, dashboards, components) are stored as text.
-- auth.users.id is uuid (Supabase-managed). We match types accordingly.

create table if not exists public.workspaces (
  id          text primary key default gen_random_uuid()::text,
  name        text not null,
  slug        text unique not null,
  created_at  timestamptz default now()
);

-- ── Workspace members ─────────────────────────────────────────────────────────
create table if not exists public.workspace_members (
  workspace_id  text not null references public.workspaces(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          text not null default 'member'
                check (role in ('owner', 'admin', 'member')),
  joined_at     timestamptz default now(),
  primary key (workspace_id, user_id)
);

-- ── Pending email invites ─────────────────────────────────────────────────────
create table if not exists public.workspace_invites (
  id            text primary key default gen_random_uuid()::text,
  workspace_id  text not null references public.workspaces(id) on delete cascade,
  email         text not null,
  role          text not null default 'member'
                check (role in ('admin', 'member')),
  invited_at    timestamptz default now(),
  unique (workspace_id, email)
);

-- ── Per-project access overrides ──────────────────────────────────────────────
create table if not exists public.project_roles (
  project_id  text not null references public.projects(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'view'
              check (role in ('none', 'view', 'run', 'edit', 'admin')),
  primary key (project_id, user_id)
);

-- ── Scope projects to a workspace ─────────────────────────────────────────────
alter table public.projects
  add column if not exists workspace_id text references public.workspaces(id) on delete cascade;

-- ── Dashboard visibility ──────────────────────────────────────────────────────
alter table public.dashboards
  add column if not exists visibility text not null default 'workspace'
  check (visibility in ('private', 'workspace', 'public'));

-- ── Public share tokens ───────────────────────────────────────────────────────
create table if not exists public.dashboard_shares (
  id            text primary key default gen_random_uuid()::text,
  dashboard_id  text not null references public.dashboards(id) on delete cascade,
  token         text unique not null default encode(gen_random_bytes(32), 'hex'),
  expires_at    timestamptz,
  created_at    timestamptz default now()
);
