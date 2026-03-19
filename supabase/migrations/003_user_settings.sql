-- User settings: API keys, active model, system instructions.
-- Single-row store keyed by id = 'default' (single-user mode).
-- API keys are stored as plaintext in the database row but protected by
-- Supabase RLS + service-role-only backend access.
-- Future: migrate key fields to vault.create_secret() for encryption at rest.

create table if not exists user_settings (
  id                   text        primary key default 'default',
  anthropic_api_key    text        not null default '',
  openai_api_key       text        not null default '',
  gemini_api_key       text        not null default '',
  active_provider      text        not null default '',
  active_model         text        not null default '',
  system_instructions  text        not null default '',
  updated_at           timestamptz not null default now()
);

-- Seed the default row so GET always returns something
insert into user_settings (id) values ('default') on conflict (id) do nothing;
