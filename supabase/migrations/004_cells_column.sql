-- Add notebook cells to components.
-- cells is an ordered array of {id, source} objects.
-- When non-empty it takes precedence over the legacy `code` column.
alter table components
  add column if not exists cells jsonb not null default '[]';
