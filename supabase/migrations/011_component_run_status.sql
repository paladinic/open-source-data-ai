-- Track the outcome of the most recent execution for each component.
-- last_run_ok: true = last run succeeded, false = last run failed, null = never run
-- last_error:  the error message from the most recent failed run (truncated to 2000 chars)
alter table public.components
  add column if not exists last_run_ok boolean,
  add column if not exists last_error  text not null default '';
