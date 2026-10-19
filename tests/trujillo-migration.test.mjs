import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
test("The Trujillo migration changes original sample entities without changing recorded money or files", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE shared_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT)",
  );
  const before = {
    suppliers: [
      {
        id: 1,
        name: "Pluz Energía",
        category: "Servicios",
        bank: "Anterior",
        account: "ANTERIOR",
      },
      { id: 2, name: "Sedapal", category: "Servicios" },
      {
        id: 3,
        name: "Proveedor personalizado",
        category: "Otros",
        bank: "Conservar",
        account: "CONSERVAR",
      },
      { id: 4, name: "SAT", category: "Impuestos" },
    ],
    bills: [
      { id: 1, amount_cents: 9900, paid_cents: 500, approval: "blocked" },
    ],
    payments: [{ id: 1, amount_cents: 500, operation: "CONSERVAR-001" }],
    receipts: [{ id: 1, key: "conservar-archivo" }],
    settings: { threshold_cents: 50000, reminder_days: 3, recipient: "both" },
    next: { suppliers: 5, bills: 2 },
  };
  db.prepare("INSERT INTO shared_state VALUES(1,0,?)").run(
    JSON.stringify(before),
  );
  db.exec(readFileSync("migrations/0004_trujillo_workflow.sql", "utf8"));
  const after = JSON.parse(
    db.prepare("SELECT payload FROM shared_state WHERE id=1").get().payload,
  );
  assert.deepEqual(
    after.suppliers.map((s) => s.name),
    [
      "Hidrandina",
      "Sedalib",
      "Proveedor personalizado",
      "SATT",
      "Caja Trujillo",
    ],
  );
  assert.deepEqual(after.suppliers[2], before.suppliers[2]);
  assert.equal(after.suppliers[0].account, "");
  assert.deepEqual(after.payments, before.payments);
  assert.deepEqual(after.receipts, before.receipts);
  assert.equal(after.bills[0].amount_cents, 9900);
  assert.equal(after.bills[0].paid_cents, 500);
  assert.equal(after.bills[0].approval, "approved");
  assert.equal(after.next.suppliers, 6);
  assert.deepEqual(after.loans, []);
  assert.equal(after.settings.threshold_cents, undefined);
  db.close();
});
