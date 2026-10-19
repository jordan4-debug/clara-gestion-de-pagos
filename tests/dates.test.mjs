import { test } from "node:test";
import assert from "node:assert/strict";
import { today, status, monthDate } from "../server/domain.mjs";
test("A payment remains current throughout its due date in Trujillo/Lima, including the UTC date boundary", () => {
  const bill = {
    amount_cents: 1000,
    paid_cents: 0,
    approval: "required",
    due_date: "2026-10-18",
  };
  assert.equal(today(new Date("2026-10-19T04:59:59Z")), "2026-10-18");
  assert.equal(
    status(bill, today(new Date("2026-10-19T04:59:59Z"))),
    "Pendiente",
  );
  assert.equal(
    status(bill, today(new Date("2026-10-19T05:00:00Z"))),
    "Vencido",
  );
  assert.equal(
    status({ ...bill, due_date: "2026-10-20" }, "2026-10-18"),
    "Pendiente",
  );
  assert.equal(status({ ...bill, paid_cents: 1000 }, "2026-10-25"), "Pagado");
  assert.equal(monthDate("2028-02", 31), "2028-02-29");
});
