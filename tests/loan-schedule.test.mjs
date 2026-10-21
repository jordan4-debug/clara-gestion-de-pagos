import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateSchedule } from "../server/loan-schedule.mjs";

const parameters = (extra = {}) => ({
  principal_cents: 3600000,
  total_interest_percent: 17.02,
  disbursement_date: "2026-03-05",
  installments: 24,
  double_months: [7, 12],
  ...extra,
});
function verify(result) {
  const rows = result.schedule;
  assert.equal(rows[0].opening_balance_cents, result.principal_cents);
  assert.equal(rows.at(-1).closing_balance_cents, 0);
  for (const [i, row] of rows.entries()) {
    for (const key of [
      "amount_cents",
      "interest_cents",
      "amortization_cents",
      "opening_balance_cents",
      "closing_balance_cents",
    ])
      assert.ok(
        Number.isSafeInteger(row[key]) && row[key] >= 0,
        `${i}: ${key}`,
      );
    assert.ok(row.amortization_cents > 0);
    assert.equal(row.amount_cents, row.interest_cents + row.amortization_cents);
    assert.equal(
      row.opening_balance_cents - row.amortization_cents,
      row.closing_balance_cents,
    );
    if (i)
      assert.equal(
        row.opening_balance_cents,
        rows[i - 1].closing_balance_cents,
      );
    if (i < rows.length - 1)
      assert.equal(
        row.amount_cents,
        result.base_installment_cents * (row.is_double ? 2 : 1),
      );
  }
  const sum = (key) => rows.reduce((n, row) => n + row[key], 0);
  assert.equal(sum("amortization_cents"), result.principal_cents);
  assert.equal(sum("interest_cents"), result.interest_total_cents);
  assert.equal(sum("amount_cents"), result.total_cents);
}

test("Confirmed total-interest interpretation applies 17.02% once and uses calendar months, not 30-day periods", () => {
  const result = calculateSchedule(parameters());
  verify(result);
  assert.equal(result.interest_total_cents, 612720);
  assert.equal(result.total_cents, 4212720);
  assert.equal(result.base_installment_cents, 150454);
  assert.deepEqual(
    result.schedule.slice(0, 4).map((row) => row.due_date),
    ["2026-04-05", "2026-05-05", "2026-06-05", "2026-07-05"],
  );
  assert.deepEqual(
    result.schedule.filter((row) => row.is_double).map((row) => row.due_date),
    ["2026-07-05", "2026-12-05", "2027-07-05", "2027-12-05"],
  );
  assert.equal(result.schedule[3].amount_cents, 300908);
  assert.equal(result.schedule.at(-1).amount_cents, 150462);
  assert.equal(result.schedule.at(-1).due_date, "2028-03-05");
});

test("Anchor day recovers after short months, leap years and historical years", () => {
  for (const [disbursement_date, expected] of [
    ["2023-01-31", ["2023-02-28", "2023-03-31", "2023-04-30"]],
    ["2024-01-31", ["2024-02-29", "2024-03-31", "2024-04-30"]],
    ["1999-12-31", ["2000-01-31", "2000-02-29", "2000-03-31"]],
    ["1900-01-31", ["1900-02-28", "1900-03-31", "1900-04-30"]],
  ]) {
    const result = calculateSchedule(
      parameters({ disbursement_date, installments: 3 }),
    );
    verify(result);
    assert.deepEqual(
      result.schedule.map((row) => row.due_date),
      expected,
    );
  }
});

test("Cent rounding, zero interest, single installment and all-double schedules retain exact accounting identities", () => {
  for (const principal_cents of [101, 10001, 1234567, 99999999])
    for (const total_interest_percent of [0, 0.01, 17.02, 99.99])
      for (const installments of [1, 2, 24])
        for (const double_months of [
          [],
          [2, 7, 12],
          Array.from({ length: 12 }, (_, i) => i + 1),
        ]) {
          if (
            installments === 1 &&
            principal_cents === 99999999 &&
            total_interest_percent > 0
          )
            continue; // Existing per-payment amount cap.
          verify(
            calculateSchedule(
              parameters({
                principal_cents,
                total_interest_percent,
                installments,
                double_months,
              }),
            ),
          );
        }
  const halfCent = calculateSchedule(
    parameters({
      principal_cents: 100,
      total_interest_percent: 0.5,
      installments: 1,
    }),
  );
  assert.equal(halfCent.interest_total_cents, 1);
  assert.equal(halfCent.total_cents, 101);
});

test("Invalid precision, dates, double-months and unrepresentable schedules are rejected before persistence", () => {
  for (const extra of [
    { total_interest_percent: 1.001 },
    { total_interest_percent: Infinity },
    { total_interest_percent: -1 },
    { total_interest_percent: "17.02" },
    { installments: 1.1 },
    { installments: 121 },
    { double_months: [7, 7] },
    { double_months: [1.5] },
    { double_months: [13] },
    { disbursement_date: "2025-02-29" },
    { disbursement_date: "2099-12-01" },
    { disbursement_date: "1899-12-01" },
    { principal_cents: 1, installments: 24 },
    { amount_cents: 1 },
    { schedule: [] },
    { installment_cents: 100 },
  ])
    assert.throws(
      () => calculateSchedule(parameters(extra)),
      JSON.stringify(extra),
    );
});
