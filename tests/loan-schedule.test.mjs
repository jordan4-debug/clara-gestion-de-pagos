import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateSchedule } from "../server/loan-schedule.mjs";
const parameters = (extra = {}) => ({
  principal_cents: 3600000,
  annual_interest_percent: "17.02",
  first_due_date: "2026-04-04",
  installments: 24,
  double_months: [7, 12],
  ...extra,
});
function verify(result) {
  const rows = result.schedule,
    basis = BigInt(result.annual_interest_percent.replace(".", ""));
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
    // Independent rational-integer check; does not use the implementation's Decimal library.
    const numerator = BigInt(row.opening_balance_cents) * basis;
    assert.equal(
      row.interest_cents,
      Number((2n * numerator + 120000n) / 240000n),
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
  assert.equal(
    result.total_cents,
    result.principal_cents + result.interest_total_cents,
  );
}
test("French schedule applies BCP annual/12 interest to opening balances and retains calendar months", () => {
  const r = calculateSchedule(parameters());
  verify(r);
  assert.equal(r.calculation_method, "french-nominal-monthly-v1");
  assert.equal(r.schedule[0].interest_cents, 51060);
  assert.equal(r.base_installment_cents, 152607);
  assert.equal(r.schedule[0].amortization_cents, 101547);
  assert.equal(r.schedule[0].closing_balance_cents, 3498453);
  assert.equal(r.schedule[3].amount_cents, 305214);
  assert.equal(r.schedule.at(-1).amount_cents, 152593);
  assert.equal(r.total_cents, 4272982);
  assert.equal(r.interest_total_cents, 672982);
  assert.deepEqual(
    r.schedule.slice(0, 4).map((row) => row.due_date),
    ["2026-04-04", "2026-05-04", "2026-06-04", "2026-07-04"],
  );
  assert.deepEqual(
    r.schedule.filter((row) => row.is_double).map((row) => row.due_date),
    ["2026-07-04", "2026-12-04", "2027-07-04", "2027-12-04"],
  );
  assert.equal(r.schedule.at(-1).due_date, "2028-03-04");
  assert.ok(
    r.schedule.every(
      (row, i) => !i || row.interest_cents < r.schedule[i - 1].interest_cents,
    ),
  );
});
test("Without doubles, weighted annuities reduce to the ordinary French annuity", () => {
  const r = calculateSchedule(parameters({ double_months: [] }));
  verify(r);
  // Verified separately with Python Decimal at 80 digits, P*r/(1-(1+r)^-24).
  assert.equal(r.base_installment_cents, 178027);
  assert.equal(r.schedule.at(-1).amount_cents, 178020);
  assert.equal(r.total_cents, 4272641);
});
test("The provided date is the first quota and historical calendar anchors recover after February", () => {
  for (const [first_due_date, expected] of [
    ["2023-01-31", ["2023-01-31", "2023-02-28", "2023-03-31"]],
    ["2024-01-31", ["2024-01-31", "2024-02-29", "2024-03-31"]],
    ["1999-12-31", ["1999-12-31", "2000-01-31", "2000-02-29"]],
    ["1900-01-31", ["1900-01-31", "1900-02-28", "1900-03-31"]],
  ]) {
    const r = calculateSchedule(
      parameters({ first_due_date, installments: 3 }),
    );
    verify(r);
    assert.deepEqual(
      r.schedule.map((row) => row.due_date),
      expected,
    );
  }
});
test("Decimal cent rounding handles zero interest, half cents, a single quota, double final payments and long terms", () => {
  for (const principal_cents of [10001, 1234567])
    for (const annual_interest_percent of ["0", "0.01", "17.02"])
      for (const installments of [1, 2, 24])
        for (const double_months of [
          [],
          [2, 7, 12],
          Array.from({ length: 12 }, (_, i) => i + 1),
        ])
          verify(
            calculateSchedule(
              parameters({
                principal_cents,
                annual_interest_percent,
                installments,
                double_months,
              }),
            ),
          );
  const half = calculateSchedule(
    parameters({
      principal_cents: 100,
      annual_interest_percent: "6",
      installments: 1,
    }),
  );
  assert.equal(half.schedule[0].interest_cents, 1);
  assert.equal(half.total_cents, 101);
  assert.equal(half.base_installment_cents, 101);
  const recurringHalf = calculateSchedule(
    parameters({
      principal_cents: 60000,
      annual_interest_percent: "0.01",
      installments: 1,
    }),
  );
  assert.equal(recurringHalf.schedule[0].interest_cents, 1);
  assert.equal(recurringHalf.base_installment_cents, 60001);
  verify(
    calculateSchedule(parameters({ installments: 120, double_months: [] })),
  );
  verify(
    calculateSchedule(
      parameters({ first_due_date: "2025-01-31", installments: 12 }),
    ),
  );
  assert.equal(
    calculateSchedule(
      parameters({
        principal_cents: 1,
        annual_interest_percent: "0",
        installments: 1,
      }),
    ).schedule[0].closing_balance_cents,
    0,
  );
});
test("Invalid rates, dates, precision, client-forged calculations and unrepresentable contracts are rejected", () => {
  for (const extra of [
    {
      annual_interest_percent: "99.99",
      installments: 24,
      double_months: [2, 7, 12],
    },
    { annual_interest_percent: 17.02 },
    { annual_interest_percent: "1.001" },
    { annual_interest_percent: "NaN" },
    { annual_interest_percent: "Infinity" },
    { annual_interest_percent: "-1" },
    { annual_interest_percent: "1e2" },
    { annual_interest_percent: "17,02" },
    { annual_interest_percent: "1000.01" },
    { annual_interest_percent: "" },
    { installments: 1.1 },
    { installments: 121 },
    { double_months: [7, 7] },
    { double_months: [1.5] },
    { double_months: [13] },
    { first_due_date: "2025-02-29" },
    { first_due_date: "2099-12-01" },
    { first_due_date: "1899-12-01" },
    { principal_cents: 1, installments: 24 },
    { amount_cents: 1 },
    { schedule: [] },
    { installment_cents: 100 },
    { total_interest_percent: 17.02 },
    { disbursement_date: "2026-03-05" },
  ])
    assert.throws(
      () => calculateSchedule(parameters(extra)),
      JSON.stringify(extra),
    );
});
