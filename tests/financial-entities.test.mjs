import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { financialEntities } from "../server/financial-entities.mjs";
import { seedState } from "../server/cloud-state.mjs";

const migration = readFileSync(
  "migrations/0009_entities_variation_alerts.sql",
  "utf8",
);
test("The expanded financial catalog exists on a new workspace with unique IDs and a valid next ID", () => {
  const state = seedState();
  for (const name of financialEntities) {
    const found = state.suppliers.filter((s) => s.name === name);
    assert.equal(found.length, 1, name);
    assert.equal(found[0].category, "Préstamos");
    assert.equal(found[0].reference, "");
  }
  assert.equal(
    new Set(state.suppliers.map((s) => s.id)).size,
    state.suppliers.length,
  );
  assert.ok(
    state.next.suppliers > Math.max(...state.suppliers.map((s) => s.id)),
  );
});
test("Catalog migration preserves data and existing aliases, repairs an outdated next ID and is idempotent", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      "CREATE TABLE shared_state(id INTEGER PRIMARY KEY, revision INTEGER, payload TEXT)",
    );
    const before = {
      suppliers: [
        {
          id: 77,
          name: "Banco de Crédito del Perú",
          category: "Préstamos",
          reference: "CONSERVAR",
        },
        { id: 100, name: "Proveedor propio", category: "Otros" },
      ],
      next: { suppliers: 3, bills: 50 },
      bills: [{ id: 49, amount_cents: 14550 }],
      payments: [{ id: 1, amount_cents: 1000 }],
      cash_movements: [{ id: 1, amount_cents: 2000 }],
      loans: [{ id: 1 }],
      receipts: [{ id: 1, key: "conservar" }],
      settings: {
        reminder_days: 7,
        recipient: "both",
        variation_percent: 35,
        variation_enabled: false,
      },
    };
    db.prepare("INSERT INTO shared_state VALUES(1,0,?)").run(
      JSON.stringify(before),
    );
    db.exec(migration);
    const row = db.prepare("SELECT * FROM shared_state WHERE id=1").get();
    const after = JSON.parse(row.payload);
    assert.deepEqual(after.suppliers.slice(0, 2), before.suppliers);
    assert.equal(after.suppliers.length, 10);
    assert.ok(!after.suppliers.some((s) => s.name === "BCP"));
    assert.ok(
      after.suppliers
        .slice(2)
        .every((s) => s.id > 100 && s.category === "Préstamos"),
    );
    assert.equal(after.next.suppliers, 109);
    for (const key of [
      "bills",
      "payments",
      "cash_movements",
      "loans",
      "receipts",
    ])
      assert.deepEqual(after[key], before[key], key);
    assert.equal(after.settings.variation_percent, 35);
    assert.equal(after.settings.variation_enabled, false);
    assert.equal(after.settings.variation_min_cents, 1000);
    assert.equal(after.settings.reminder_days, 7);
    db.exec(migration);
    assert.deepEqual(
      db.prepare("SELECT * FROM shared_state WHERE id=1").get(),
      row,
    );
  } finally {
    db.close();
  }
});
