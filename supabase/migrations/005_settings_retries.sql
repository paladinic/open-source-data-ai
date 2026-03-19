-- Add max_auto_retries to user_settings.
alter table user_settings
  add column if not exists max_auto_retries integer not null default 3;
