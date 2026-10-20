-- Administrative scope: preserve all prior obligations, loans, budgets and receipts.
UPDATE accounts SET name='Gerente de demo' WHERE demo=1 AND role='owner';
UPDATE shared_state SET payload=json_set(payload,'$.settings.scope','administrative'),revision=revision+1;
