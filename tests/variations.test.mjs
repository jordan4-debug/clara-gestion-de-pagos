import { test } from "node:test";
import assert from "node:assert/strict";
import {
  billVariation,
  variationConfig,
  variationSummary,
} from "../server/variations.mjs";
import { memory } from "./helpers/memory.mjs";
import { readState } from "../server/cloud-state.mjs";

const previous = {
  id: 1,
  supplier_id: 1,
  title: "Luz",
  service_reference: "SUM-001",
  month: "2027-01",
  due_date: "2027-01-30",
  amount_cents: 10000,
  paid_cents: 10000,
  invoice_number: "E-001",
  invoice_receipt_id: 1,
};
const current = {
  ...previous,
  id: 2,
  month: "2027-02",
  due_date: "2027-02-28",
  amount_cents: 15000,
  paid_cents: 0,
  invoice_number: "E-002",
  invoice_receipt_id: 2,
};
const fixture = () => ({
  suppliers: [{ id: 1, name: "Hidrandina", category: "Servicios" }],
  loans: [],
  bills: [{ ...previous }, { ...current }],
  receipts: [{ id: 1 }, { id: 2 }],
  settings: {},
});

test("Variations compare invoice face amounts for the same entity and supply, independently of payment and title", () => {
  const state = fixture();
  state.bills[1].title = "Recibo de energía eléctrica";
  state.bills[1].service_reference = "  sum-001  ";
  const result = billVariation(state, state.bills[1]);
  assert.equal(result.status, "compared");
  assert.equal(result.previous_cents, 10000);
  assert.equal(result.current_cents, 15000);
  assert.equal(result.difference_cents, 5000);
  assert.equal(result.percent, 50);
  assert.equal(result.alert, true);
  assert.equal(result.previous_bill_id, 1);
  state.bills[1].paid_cents = 15000;
  assert.equal(billVariation(state, state.bills[1]).alert, true);
  assert.equal(variationSummary(state, "2027-01").alerts.length, 0);
  assert.equal(variationSummary(state, "2027-02").alerts.length, 1);
});

test("Variation thresholds require an actual increase, both limits and unrounded integer-cent comparisons", () => {
  const state = fixture();
  for (const [percent, minimum, amount, expected] of [
    [20, 1000, 12000, true],
    [20, 1000, 11999, false],
    [20, 5001, 15000, false],
    [51, 1000, 15000, false],
    [1, 0, 10000, false],
    [1, 0, 9999, false],
  ]) {
    state.settings = {
      variation_percent: percent,
      variation_min_cents: minimum,
    };
    state.bills[1].amount_cents = amount;
    assert.equal(billVariation(state, state.bills[1]).alert, expected);
  }
  state.settings = { variation_percent: 20, variation_min_cents: 0 };
  state.bills[0].amount_cents = 10001;
  state.bills[1].amount_cents = 12001;
  assert.equal(billVariation(state, state.bills[1]).alert, false);
  state.settings.variation_enabled = false;
  state.bills[1].amount_cents = 30000;
  assert.equal(variationSummary(state, "2027-02").alerts.length, 0);
  assert.equal(
    variationConfig({ variation_percent: NaN }).variation_percent,
    20,
  );
});

test("Missing, example, ambiguous or unbacked supplies and loans do not produce misleading variation alerts", () => {
  for (const [reference, expected] of [
    ["", "missing_reference"],
    ["Ejemplo ficticio · no usar para transferencias", "missing_reference"],
    ["OTRO-SUMINISTRO", "no_previous"],
  ]) {
    const state = fixture();
    state.bills[1].service_reference = reference;
    assert.equal(billVariation(state, state.bills[1]).status, expected);
  }
  const state = fixture();
  state.bills[1].invoice_receipt_id = null;
  assert.equal(billVariation(state, state.bills[1]).status, "missing_original");
  state.bills[1] = { ...current };
  state.bills[0].amount_cents = 0;
  assert.equal(
    billVariation(state, state.bills[1]).status,
    "incomplete_previous",
  );
  state.bills[0] = { ...previous };
  state.bills.push({ ...previous, id: 3 });
  assert.equal(billVariation(state, state.bills[1]).status, "ambiguous_period");
  state.bills[2].archived_at = "2027-01-31";
  assert.equal(billVariation(state, state.bills[1]).alert, true);
  state.bills.push({ ...current, id: 4 });
  assert.equal(billVariation(state, state.bills[1]).status, "ambiguous_period");
  state.bills[1].loan_id = 55;
  assert.equal(billVariation(state, state.bills[1]), null);
  state.bills[1] = { ...current, category: "Préstamos" };
  assert.equal(billVariation(state, state.bills[1]), null);
});

test("Only the manager changes variation settings; independent reminder updates preserve thresholds and unknown fields", async () => {
  const m = memory(),
    owner = m.client(),
    assistant = m.client();
  try {
    await owner("/auth/demo", "POST", { role: "owner" });
    await assistant("/auth/demo", "POST", { role: "assistant" });
    assert.equal(
      (await assistant("/settings", "PUT", { variation_percent: 50 })).status,
      403,
    );
    const before = (await readState(m.db)).state;
    assert.equal(
      (
        await owner("/settings", "PUT", {
          variation_enabled: true,
          variation_percent: 50,
          variation_min_cents: 2500,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await owner("/settings", "PUT", {
          reminder_days: 7,
          recipient: "owner",
        })
      ).status,
      200,
    );
    const settings = (await owner("/settings")).data;
    assert.equal(settings.variation_percent, 50);
    assert.equal(settings.variation_min_cents, 2500);
    assert.equal(settings.reminder_days, 7);
    assert.equal(settings.recipient, "owner");
    const after = (await readState(m.db)).state;
    assert.deepEqual(after.bills, before.bills);
    assert.deepEqual(after.payments, before.payments);
    assert.deepEqual(after.cash_movements, before.cash_movements);
    for (const input of [
      { variation_percent: 0 },
      { variation_percent: "20" },
      { variation_percent: 1.5 },
      { variation_enabled: "true" },
      { variation_min_cents: -1 },
      { variation_min_cents: 10.001 },
      {},
    ])
      assert.equal((await owner("/settings", "PUT", input)).status, 400);
    const managerDashboard = (await owner("/dashboard")).data;
    const assistantDashboard = (await assistant("/dashboard")).data;
    assert.ok(managerDashboard.variation_summary);
    assert.equal(assistantDashboard.variation_summary, undefined);
    assert.deepEqual(managerDashboard.bills, assistantDashboard.bills);
  } finally {
    m.sqlite.close();
  }
});

test("API exposes a real S/100 to S/150 comparison with protected document links without changing the receipt", async () => {
  const m = memory(),
    assistant = m.client(),
    manager = m.client();
  try {
    await manager("/auth/demo", "POST", { role: "owner" });
    await assistant("/auth/demo", "POST", { role: "assistant" });
    const invoice = {
      name: "original.pdf",
      mime: "application/pdf",
      base64: Buffer.from("%PDF-1.4\nRecibo ficticio.").toString("base64"),
    };
    const make = async (number, due, amount) => {
      const r = await assistant("/bills", "POST", {
        title: "Energía",
        supplier_id: 1,
        amount_cents: amount,
        due_date: due,
        invoice_number: number,
        service_reference: "SUM-API-TEST",
        invoice,
      });
      assert.equal(r.status, 201, JSON.stringify(r.data));
      return r.data.id;
    };
    const earlier = await make("ALERT-001", "2028-01-30", 10000);
    const later = await make("ALERT-002", "2028-02-28", 15000);
    const before = await readState(m.db);
    const dashboard = (await manager("/dashboard?month=2028-02")).data;
    assert.equal(dashboard.variation_summary.alerts.length, 1);
    assert.equal(
      dashboard.variation_summary.alerts[0].previous_bill_id,
      earlier,
    );
    const detail = (await manager(`/bills/${later}`)).data;
    assert.equal(detail.variation.percent, 50);
    assert.equal(detail.variation.alert, true);
    assert.equal(
      (await assistant(`/bills/${later}`)).data.variation,
      undefined,
    );
    assert.equal(
      (await manager(`/receipts/${detail.variation.previous_receipt_id}`))
        .status,
      200,
    );
    assert.deepEqual(await readState(m.db), before);
  } finally {
    m.sqlite.close();
  }
});
