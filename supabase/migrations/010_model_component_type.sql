-- Allow 'model' as a component type.
-- Models always run on unfiltered data and are excluded from dashboard filter propagation.

alter table public.components
  drop constraint if exists components_type_check;

alter table public.components
  add constraint components_type_check
  check (type in ('etl', 'visualisation', 'model'));
