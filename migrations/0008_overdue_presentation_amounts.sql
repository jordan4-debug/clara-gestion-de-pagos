-- Requested correction of two unpaid presentation records, not a rule for future bills.
-- Keep paid amounts, documents, contracts and every other obligation unchanged.
UPDATE shared_state
SET payload = json_set(payload, '$.bills', json((
  SELECT json_group_array(json(CASE
    WHEN json_extract(b.value, '$.id') = 8
      AND upper(json_extract(b.value, '$.title')) = 'LUZ'
      AND json_extract(b.value, '$.month') = '2026-10'
      AND json_extract(b.value, '$.due_date') = '2026-10-18'
      AND json_extract(b.value, '$.amount_cents') = 1
      AND json_extract(b.value, '$.paid_cents') = 0
      AND json_extract(b.value, '$.loan_id') IS NULL
      AND json_extract(b.value, '$.invoice_receipt_id') IS NULL
      AND NOT EXISTS (SELECT 1 FROM json_each(shared_state.payload, '$.payments') p
        WHERE json_extract(p.value, '$.bill_id') = 8)
    THEN json_set(b.value, '$.amount_cents', 10000,
      '$.amount_correction', json_object('previous_cents', 1,
        'reason', 'Corrección de importe de presentación solicitada', 'date', '2026-10-20'))
    WHEN json_extract(b.value, '$.id') = 12
      AND upper(json_extract(b.value, '$.title')) = 'INTERNET'
      AND json_extract(b.value, '$.month') = '2026-10'
      AND json_extract(b.value, '$.due_date') = '2026-10-19'
      AND json_extract(b.value, '$.amount_cents') = 100
      AND json_extract(b.value, '$.paid_cents') = 0
      AND json_extract(b.value, '$.loan_id') IS NULL
      AND json_extract(b.value, '$.invoice_receipt_id') IS NULL
      AND NOT EXISTS (SELECT 1 FROM json_each(shared_state.payload, '$.payments') p
        WHERE json_extract(p.value, '$.bill_id') = 12)
    THEN json_set(b.value, '$.amount_cents', 8000,
      '$.amount_correction', json_object('previous_cents', 100,
        'reason', 'Corrección de importe de presentación solicitada', 'date', '2026-10-20'))
    ELSE b.value END))
  FROM json_each(shared_state.payload, '$.bills') b
))), revision = revision + 1
WHERE EXISTS (
  SELECT 1 FROM json_each(shared_state.payload, '$.bills') b
  WHERE json_extract(b.value, '$.paid_cents') = 0
    AND json_extract(b.value, '$.month') = '2026-10'
    AND json_extract(b.value, '$.loan_id') IS NULL
    AND json_extract(b.value, '$.invoice_receipt_id') IS NULL
    AND (
      (json_extract(b.value, '$.id') = 8 AND upper(json_extract(b.value, '$.title')) = 'LUZ'
        AND json_extract(b.value, '$.due_date') = '2026-10-18' AND json_extract(b.value, '$.amount_cents') = 1)
      OR
      (json_extract(b.value, '$.id') = 12 AND upper(json_extract(b.value, '$.title')) = 'INTERNET'
        AND json_extract(b.value, '$.due_date') = '2026-10-19' AND json_extract(b.value, '$.amount_cents') = 100)
    )
    AND NOT EXISTS (SELECT 1 FROM json_each(shared_state.payload, '$.payments') p
      WHERE json_extract(p.value, '$.bill_id') = json_extract(b.value, '$.id'))
);
