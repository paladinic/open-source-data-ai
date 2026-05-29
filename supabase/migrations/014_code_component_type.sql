-- Add 'code' as a valid component type
ALTER TABLE components DROP CONSTRAINT IF EXISTS components_type_check;
ALTER TABLE components ADD CONSTRAINT components_type_check
  CHECK (type IN ('etl', 'visualisation', 'model', 'code'));
