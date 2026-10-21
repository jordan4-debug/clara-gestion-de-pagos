-- Expand the administrative lender catalog. Never replace entities or alter money/history.
-- Re-running is safe; known aliases retain their IDs, categories and custom references.

UPDATE shared_state
SET payload = json_insert(
  json_set(payload, '$.next.suppliers', max(coalesce(json_extract(payload, '$.next.suppliers'), 1), coalesce((SELECT max(CAST(json_extract(s.value, '$.id') AS INTEGER)) + 1 FROM json_each(shared_state.payload, '$.suppliers') s), 1)) + 1),
  '$.suppliers[#]', json_object(
    'id', max(coalesce(json_extract(payload, '$.next.suppliers'), 1), coalesce((SELECT max(CAST(json_extract(s.value, '$.id') AS INTEGER)) + 1 FROM json_each(shared_state.payload, '$.suppliers') s), 1)),
    'name', 'BCP', 'category', 'Préstamos',
    'reference', '', 'receipt_format', 'alphanumeric'
  )
), revision = revision + 1
WHERE id = 1 AND json_array_length(payload, '$.suppliers') < 100
  AND NOT EXISTS (
    SELECT 1 FROM json_each(shared_state.payload, '$.suppliers') s
    WHERE lower(trim(json_extract(s.value, '$.name'))) IN ('bcp', 'banco de crédito del perú', 'banco de credito del peru')
  );

UPDATE shared_state
SET payload = json_insert(
  json_set(payload, '$.next.suppliers', max(coalesce(json_extract(payload, '$.next.suppliers'), 1), coalesce((SELECT max(CAST(json_extract(s.value, '$.id') AS INTEGER)) + 1 FROM json_each(shared_state.payload, '$.suppliers') s), 1)) + 1),
  '$.suppliers[#]', json_object(
    'id', max(coalesce(json_extract(payload, '$.next.suppliers'), 1), coalesce((SELECT max(CAST(json_extract(s.value, '$.id') AS INTEGER)) + 1 FROM json_each(shared_state.payload, '$.suppliers') s), 1)),
    'name', 'BBVA', 'category', 'Préstamos',
    'reference', '', 'receipt_format', 'alphanumeric'
  )
), revision = revision + 1
WHERE id = 1 AND json_array_length(payload, '$.suppliers') < 100
  AND NOT EXISTS (
    SELECT 1 FROM json_each(shared_state.payload, '$.suppliers') s
    WHERE lower(trim(json_extract(s.value, '$.name'))) IN ('bbva', 'bbva perú', 'bbva peru', 'bbva continental')
  );

UPDATE shared_state
SET payload = json_insert(
  json_set(payload, '$.next.suppliers', max(coalesce(json_extract(payload, '$.next.suppliers'), 1), coalesce((SELECT max(CAST(json_extract(s.value, '$.id') AS INTEGER)) + 1 FROM json_each(shared_state.payload, '$.suppliers') s), 1)) + 1),
  '$.suppliers[#]', json_object(
    'id', max(coalesce(json_extract(payload, '$.next.suppliers'), 1), coalesce((SELECT max(CAST(json_extract(s.value, '$.id') AS INTEGER)) + 1 FROM json_each(shared_state.payload, '$.suppliers') s), 1)),
    'name', 'Interbank', 'category', 'Préstamos',
    'reference', '', 'receipt_format', 'alphanumeric'
  )
), revision = revision + 1
WHERE id = 1 AND json_array_length(payload, '$.suppliers') < 100
  AND NOT EXISTS (
    SELECT 1 FROM json_each(shared_state.payload, '$.suppliers') s
    WHERE lower(trim(json_extract(s.value, '$.name'))) IN ('interbank', 'banco internacional del perú', 'banco internacional del peru')
  );

UPDATE shared_state
SET payload = json_insert(
  json_set(payload, '$.next.suppliers', max(coalesce(json_extract(payload, '$.next.suppliers'), 1), coalesce((SELECT max(CAST(json_extract(s.value, '$.id') AS INTEGER)) + 1 FROM json_each(shared_state.payload, '$.suppliers') s), 1)) + 1),
  '$.suppliers[#]', json_object(
    'id', max(coalesce(json_extract(payload, '$.next.suppliers'), 1), coalesce((SELECT max(CAST(json_extract(s.value, '$.id') AS INTEGER)) + 1 FROM json_each(shared_state.payload, '$.suppliers') s), 1)),
    'name', 'Scotiabank', 'category', 'Préstamos',
    'reference', '', 'receipt_format', 'alphanumeric'
  )
), revision = revision + 1
WHERE id = 1 AND json_array_length(payload, '$.suppliers') < 100
  AND NOT EXISTS (
    SELECT 1 FROM json_each(shared_state.payload, '$.suppliers') s
    WHERE lower(trim(json_extract(s.value, '$.name'))) IN ('scotiabank', 'scotiabank perú', 'scotiabank peru')
  );

UPDATE shared_state
SET payload = json_insert(
  json_set(payload, '$.next.suppliers', max(coalesce(json_extract(payload, '$.next.suppliers'), 1), coalesce((SELECT max(CAST(json_extract(s.value, '$.id') AS INTEGER)) + 1 FROM json_each(shared_state.payload, '$.suppliers') s), 1)) + 1),
  '$.suppliers[#]', json_object(
    'id', max(coalesce(json_extract(payload, '$.next.suppliers'), 1), coalesce((SELECT max(CAST(json_extract(s.value, '$.id') AS INTEGER)) + 1 FROM json_each(shared_state.payload, '$.suppliers') s), 1)),
    'name', 'Mibanco', 'category', 'Préstamos',
    'reference', '', 'receipt_format', 'alphanumeric'
  )
), revision = revision + 1
WHERE id = 1 AND json_array_length(payload, '$.suppliers') < 100
  AND NOT EXISTS (
    SELECT 1 FROM json_each(shared_state.payload, '$.suppliers') s
    WHERE lower(trim(json_extract(s.value, '$.name'))) IN ('mibanco', 'mi banco')
  );

UPDATE shared_state
SET payload = json_insert(
  json_set(payload, '$.next.suppliers', max(coalesce(json_extract(payload, '$.next.suppliers'), 1), coalesce((SELECT max(CAST(json_extract(s.value, '$.id') AS INTEGER)) + 1 FROM json_each(shared_state.payload, '$.suppliers') s), 1)) + 1),
  '$.suppliers[#]', json_object(
    'id', max(coalesce(json_extract(payload, '$.next.suppliers'), 1), coalesce((SELECT max(CAST(json_extract(s.value, '$.id') AS INTEGER)) + 1 FROM json_each(shared_state.payload, '$.suppliers') s), 1)),
    'name', 'Banco Pichincha', 'category', 'Préstamos',
    'reference', '', 'receipt_format', 'alphanumeric'
  )
), revision = revision + 1
WHERE id = 1 AND json_array_length(payload, '$.suppliers') < 100
  AND NOT EXISTS (
    SELECT 1 FROM json_each(shared_state.payload, '$.suppliers') s
    WHERE lower(trim(json_extract(s.value, '$.name'))) IN ('banco pichincha', 'pichincha')
  );

UPDATE shared_state
SET payload = json_insert(
  json_set(payload, '$.next.suppliers', max(coalesce(json_extract(payload, '$.next.suppliers'), 1), coalesce((SELECT max(CAST(json_extract(s.value, '$.id') AS INTEGER)) + 1 FROM json_each(shared_state.payload, '$.suppliers') s), 1)) + 1),
  '$.suppliers[#]', json_object(
    'id', max(coalesce(json_extract(payload, '$.next.suppliers'), 1), coalesce((SELECT max(CAST(json_extract(s.value, '$.id') AS INTEGER)) + 1 FROM json_each(shared_state.payload, '$.suppliers') s), 1)),
    'name', 'Caja Piura', 'category', 'Préstamos',
    'reference', '', 'receipt_format', 'alphanumeric'
  )
), revision = revision + 1
WHERE id = 1 AND json_array_length(payload, '$.suppliers') < 100
  AND NOT EXISTS (
    SELECT 1 FROM json_each(shared_state.payload, '$.suppliers') s
    WHERE lower(trim(json_extract(s.value, '$.name'))) IN ('caja piura', 'caja municipal piura', 'caja municipal de piura')
  );

UPDATE shared_state
SET payload = json_insert(
  json_set(payload, '$.next.suppliers', max(coalesce(json_extract(payload, '$.next.suppliers'), 1), coalesce((SELECT max(CAST(json_extract(s.value, '$.id') AS INTEGER)) + 1 FROM json_each(shared_state.payload, '$.suppliers') s), 1)) + 1),
  '$.suppliers[#]', json_object(
    'id', max(coalesce(json_extract(payload, '$.next.suppliers'), 1), coalesce((SELECT max(CAST(json_extract(s.value, '$.id') AS INTEGER)) + 1 FROM json_each(shared_state.payload, '$.suppliers') s), 1)),
    'name', 'Caja Arequipa', 'category', 'Préstamos',
    'reference', '', 'receipt_format', 'alphanumeric'
  )
), revision = revision + 1
WHERE id = 1 AND json_array_length(payload, '$.suppliers') < 100
  AND NOT EXISTS (
    SELECT 1 FROM json_each(shared_state.payload, '$.suppliers') s
    WHERE lower(trim(json_extract(s.value, '$.name'))) IN ('caja arequipa', 'caja municipal arequipa', 'caja municipal de arequipa')
  );

UPDATE shared_state
SET payload = json_insert(
  json_set(payload, '$.next.suppliers', max(coalesce(json_extract(payload, '$.next.suppliers'), 1), coalesce((SELECT max(CAST(json_extract(s.value, '$.id') AS INTEGER)) + 1 FROM json_each(shared_state.payload, '$.suppliers') s), 1)) + 1),
  '$.suppliers[#]', json_object(
    'id', max(coalesce(json_extract(payload, '$.next.suppliers'), 1), coalesce((SELECT max(CAST(json_extract(s.value, '$.id') AS INTEGER)) + 1 FROM json_each(shared_state.payload, '$.suppliers') s), 1)),
    'name', 'Caja Huancayo', 'category', 'Préstamos',
    'reference', '', 'receipt_format', 'alphanumeric'
  )
), revision = revision + 1
WHERE id = 1 AND json_array_length(payload, '$.suppliers') < 100
  AND NOT EXISTS (
    SELECT 1 FROM json_each(shared_state.payload, '$.suppliers') s
    WHERE lower(trim(json_extract(s.value, '$.name'))) IN ('caja huancayo', 'caja municipal huancayo', 'caja municipal de huancayo')
  );

UPDATE shared_state
SET payload = json_set(payload, '$.settings.variation_enabled', json('true')), revision = revision + 1
WHERE id = 1 AND json_type(payload, '$.settings.variation_enabled') IS NULL;

UPDATE shared_state
SET payload = json_set(payload, '$.settings.variation_percent', 20), revision = revision + 1
WHERE id = 1 AND json_type(payload, '$.settings.variation_percent') IS NULL;

UPDATE shared_state
SET payload = json_set(payload, '$.settings.variation_min_cents', 1000), revision = revision + 1
WHERE id = 1 AND json_type(payload, '$.settings.variation_min_cents') IS NULL;
