import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(
  "migrations/0008_overdue_presentation_amounts.sql",
  "utf8",
);
const fixture = () => ({
  bills: [
    {
      id: 8,
      title: "LUZ",
      month: "2026-10",
      due_date: "2026-10-18",
      amount_cents: 1,
      paid_cents: 0,
      notes: "Conservar",
    },
    {
      id: 12,
      title: "INTERNET",
      month: "2026-10",
      due_date: "2026-10-19",
      amount_cents: 100,
      paid_cents: 0,
    },
    {
      id: 28,
      title: "luz",
      month: "2026-10",
      due_date: "2026-10-27",
      amount_cents: 3099,
      paid_cents: 0,
      invoice_receipt_id: 9,
    },
    { id: 30, title: "Cuota", loan_id: 2, amount_cents: 4500, paid_cents: 0 },
  ],
  payments: [{ id: 1, bill_id: 9, amount_cents: 4000 }],
  receipts: [{ id: 9, key: "conservar" }],
  loans: [{ id: 2, total_cents: 54000 }],
});
function database(state) {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE shared_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT)",
  );
  db.prepare("INSERT INTO shared_state VALUES(1,0,?)").run(
    JSON.stringify(state),
  );
  return db;
}
const read = (db) =>
  JSON.parse(
    db.prepare("SELECT payload FROM shared_state WHERE id=1").get().payload,
  );

test("Requested overdue examples become S/100.00 and S/80.00 without changing dates, payments, loans or other bills", () => {
  const before = fixture(),
    db = database(before);
  db.exec(sql);
  const after = read(db);
  assert.equal(after.bills[0].amount_cents, 10000);
  assert.equal(after.bills[1].amount_cents, 8000);
  assert.equal(after.bills[0].amount_correction.previous_cents, 1);
  assert.equal(after.bills[1].amount_correction.previous_cents, 100);
  for (let i = 0; i < 2; i++) {
    const { amount_cents, amount_correction, ...rest } = after.bills[i];
    const { amount_cents: previous, ...original } = before.bills[i];
    assert.deepEqual(rest, original);
  }
  assert.deepEqual(after.bills.slice(2), before.bills.slice(2));
  assert.deepEqual(after.payments, before.payments);
  assert.deepEqual(after.receipts, before.receipts);
  assert.deepEqual(after.loans, before.loans);
  db.exec(sql);
  assert.deepEqual(read(db), after);
  assert.equal(
    db.prepare("SELECT revision FROM shared_state WHERE id=1").get().revision,
    1,
  );
  db.close();
});

test("Correction skips paid, backed, reidentified or otherwise modified records and remains safe on a fresh workspace", () => {
  for (const modify of [
    (s) => {
      s.bills[0].paid_cents = 1;
      s.bills[1].paid_cents = 100;
    },
    (s) => {
      s.payments.push({ bill_id: 8 }, { bill_id: 12 });
    },
    (s) => {
      s.bills[0].invoice_receipt_id = 15;
      s.bills[1].loan_id = 2;
    },
    (s) => {
      s.bills[0].title = "Otro";
      s.bills[1].month = "2026-11";
    },
    (s) => {
      s.bills[0].amount_cents = 9000;
      s.bills[1].due_date = "2026-10-28";
    },
    (s) => {
      s.bills = [];
    },
  ]) {
    const state = fixture();
    modify(state);
    const db = database(state);
    db.exec(sql);
    assert.deepEqual(read(db), state);
    assert.equal(
      db.prepare("SELECT revision FROM shared_state WHERE id=1").get().revision,
      0,
    );
    db.close();
  }
});
