-- Preserve obligations and their files; only initialize the simulated monthly budget.
UPDATE shared_state SET payload=json_set(payload,'$.finance_periods',json(COALESCE(json_extract(payload,'$.finance_periods'),'{}'))),revision=revision+1;
