-- Add cash bookkeeping without changing debts, receipts or amounts.
UPDATE shared_state SET payload=json_set(payload,'$.cash_movements',json(COALESCE(json_extract(payload,'$.cash_movements'),'[]')),'$.next.cash',COALESCE(json_extract(payload,'$.next.cash'),1)),revision=revision+1;
