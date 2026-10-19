-- Update only the original example entities. Preserve obligations, amounts, receipts and history.
UPDATE shared_state SET payload=json_set(payload,'$.suppliers',json((
  SELECT json_group_array(json(CASE
    WHEN json_extract(value,'$.name') IN ('Pluz Energía','Pluz Energia') THEN
      json_set(value,'$.name','Hidrandina','$.portal','https://servicios.distriluz.com.pe/OficinaVirtual/',
        '$.payment_gateway','portal','$.payment_url','https://servicios.distriluz.com.pe/OficinaVirtual/','$.bank','','$.account','')
    WHEN json_extract(value,'$.name')='Sedapal' THEN
      json_set(value,'$.name','Sedalib','$.portal','https://oficinavirtual.sedalib.com.pe/login',
        '$.payment_gateway','portal','$.payment_url','https://oficinavirtual.sedalib.com.pe/login','$.bank','','$.account','')
    WHEN json_extract(value,'$.name')='SAT' THEN
      json_set(value,'$.name','SATT','$.portal','https://digital.satt.gob.pe/pagos/',
        '$.payment_gateway','portal','$.payment_url','https://digital.satt.gob.pe/pagos/','$.bank','','$.account','')
    WHEN json_extract(value,'$.name')='Inmobiliaria Los Pinos (ficticia)' THEN
      json_set(value,'$.name','Inmobiliaria Los Pinos · Trujillo (ficticia)')
    ELSE value END)) FROM json_each(shared_state.payload,'$.suppliers')
))),revision=revision+1;

UPDATE shared_state SET payload=json_set(payload,'$.bills',json((
  SELECT json_group_array(json(json_set(value,'$.approval','approved')))
  FROM json_each(shared_state.payload,'$.bills')
)),'$.loans',json(COALESCE(json_extract(payload,'$.loans'),'[]')),
  '$.next.loans',COALESCE(json_extract(payload,'$.next.loans'),1)),revision=revision+1;

UPDATE shared_state SET payload=json_remove(payload,'$.settings.threshold_cents'),revision=revision+1;

UPDATE shared_state SET payload=json_insert(payload,'$.suppliers[#]',json_object(
  'id',json_extract(payload,'$.next.suppliers'),'name','Caja Trujillo','category','Préstamos',
  'portal','https://www.cajatrujillo.com.pe/','bank','','account','','reference','',
  'channel','external','payment_gateway','manual','payment_url','',
  'payment_methods',json('["Transferencia","Ventanilla","Otro"]')
)),revision=revision+1
WHERE NOT EXISTS(SELECT 1 FROM json_each(shared_state.payload,'$.suppliers') WHERE lower(json_extract(value,'$.name'))='caja trujillo');

UPDATE shared_state SET payload=json_set(payload,'$.next.suppliers',
  (SELECT MAX(CAST(json_extract(value,'$.id') AS INTEGER))+1 FROM json_each(shared_state.payload,'$.suppliers'))),revision=revision+1;
