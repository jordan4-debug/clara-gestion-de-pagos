import { test } from "node:test";
import assert from "node:assert/strict";
import { memory } from "./helpers/memory.mjs";
import { readState } from "../server/cloud-state.mjs";
import { cashView } from "../server/cash.mjs";
import { today } from "../server/domain.mjs";
const receipt = {
  name: "constancia.pdf",
  mime: "application/pdf",
  base64: Buffer.from("%PDF-1.4\nPrueba sin valor fiscal").toString("base64"),
};
async function setup(t) {
  const m = memory(),
    manager = m.client(),
    assistant = m.client();
  t.after(() => m.sqlite.close());
  for (const [call, role] of [
    [manager, "owner"],
    [assistant, "assistant"],
  ])
    assert.equal((await call("/auth/demo", "POST", { role })).status, 200);
  const holder_id = (await assistant("/auth/me")).data.user.id;
  let invoice = 9000;
  const bill = async (amount_cents) => {
    const r = await assistant("/bills", "POST", {
      title: "Servicio para pagar",
      supplier_id: 2,
      amount_cents,
      due_date: "2025-01-31",
      invoice_number: String(invoice++),
      invoice: receipt,
    });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    return r.data.id;
  };
  const delivery = async (amount_cents, movement_date = today()) => {
    assert.equal(
      (
        await manager("/cash", "POST", {
          holder_id,
          kind: "delivery",
          amount_cents,
          movement_date,
          note: "Fondo entregado para servicios",
        })
      ).status,
      201,
    );
  };
  return { ...m, manager, assistant, holder_id, bill, delivery };
}
const payment = (amount_cents, operation, extra = {}) => ({
  amount_cents,
  operation,
  method: "Plin",
  funding_source: "manager_funds",
  receipt,
  ...extra,
});

test("Every payment medium consumes the selected manager fund once and is linked to the activity and receipt", async (t) => {
  const m = await setup(t);
  await m.delivery(100000);
  for (const [index, method] of [
    "Transferencia",
    "Yape",
    "Plin",
    "Ventanilla",
    "Otro",
    "Efectivo",
  ].entries()) {
    const id = await m.bill(1000);
    assert.equal(
      (
        await m.assistant(
          `/bills/${id}/payments`,
          "POST",
          payment(1000, `FONDO-${index}`, { method }),
        )
      ).status,
      201,
    );
    const cash = (await m.manager("/cash")).data;
    assert.equal(cash.balance_cents, 100000 - 1000 * (index + 1));
    assert.equal(cash.totals.spent, 1000 * (index + 1));
    assert.equal(cash.payment_activity.length, index + 1);
    const event = cash.payment_activity.find((p) => p.bill_id === id);
    assert.equal(event.method, method);
    assert.equal(event.funding_source, "manager_funds");
    assert.equal(event.fund_spent_cents, 1000);
    assert.equal(event.balance_after_cents, cash.balance_cents);
    assert.equal(event.reconciled, true);
    assert.ok(event.receipt_id);
    assert.equal(
      (await m.manager(`/receipts/${event.receipt_id}`)).status,
      200,
    );
    const before = JSON.stringify((await readState(m.db)).state);
    assert.equal(
      (
        await m.assistant(
          `/bills/${id}/payments`,
          "POST",
          payment(1000, `FONDO-${index}`, { method }),
        )
      ).status,
      409,
    );
    assert.equal(JSON.stringify((await readState(m.db)).state), before);
  }
  const cash = (await m.manager("/cash")).data;
  assert.equal(cash.reconciliation.closing_cents, cash.balance_cents);
  assert.equal(
    (await m.manager("/dashboard")).data.cash_summary.spent,
    cash.totals.spent,
  );
});

test("Other-fund and legacy payments appear in the activity without silently deducting or inventing the historical source", async (t) => {
  const m = await setup(t);
  const one = await m.bill(2000),
    two = await m.bill(1000);
  assert.equal(
    (
      await m.assistant(
        `/bills/${one}/payments`,
        "POST",
        payment(2000, "OTROS-FONDOS", { funding_source: "other_funds" }),
      )
    ).status,
    201,
  );
  const legacy = payment(1000, "REGISTRO-ANTERIOR");
  delete legacy.funding_source;
  assert.equal(
    (await m.assistant(`/bills/${two}/payments`, "POST", legacy)).status,
    201,
  );
  const before = JSON.stringify((await readState(m.db)).state);
  for (let i = 0; i < 2; i++) {
    const cash = (await m.manager("/cash")).data;
    assert.equal(cash.totals.spent, 0);
    assert.equal(cash.balance_cents, 0);
    assert.equal(cash.payment_activity.length, 2);
    assert.equal(
      cash.payment_activity.find((p) => p.bill_id === one).funding_source,
      "other_funds",
    );
    assert.equal(
      cash.payment_activity.find((p) => p.bill_id === two).funding_source,
      "unassigned",
    );
    assert.ok(
      cash.payment_activity.every(
        (p) => p.fund_spent_cents === 0 && p.reconciled,
      ),
    );
  }
  assert.equal(JSON.stringify((await readState(m.db)).state), before);
});

test("Funds cannot be overdrawn, forged against another holder or ambiguously charged by the manager", async (t) => {
  const m = await setup(t),
    id = await m.bill(2000);
  await m.delivery(1000);
  const before = JSON.stringify((await readState(m.db)).state);
  for (const [client, extra, status] of [
    [m.assistant, {}, 409],
    [m.assistant, { cash_holder_id: 999 }, 403],
    [m.manager, {}, 400],
    [m.manager, { cash_holder_id: 999 }, 403],
    [
      m.assistant,
      { funding_source: "other_funds", cash_holder_id: m.holder_id },
      403,
    ],
  ])
    assert.equal(
      (
        await client(
          `/bills/${id}/payments`,
          "POST",
          payment(2000, "NO-CARGAR", extra),
        )
      ).status,
      status,
    );
  assert.equal(JSON.stringify((await readState(m.db)).state), before);
  const small = await m.bill(500);
  assert.equal(
    (
      await m.manager(
        `/bills/${small}/payments`,
        "POST",
        payment(500, "GERENTE-CARGA", { cash_holder_id: m.holder_id }),
      )
    ).status,
    201,
  );
  const cash = (await m.assistant("/cash")).data;
  assert.equal(cash.balance_cents, 500);
  assert.equal(cash.payment_activity.length, 1);
  assert.equal(cash.payment_activity[0].fund_spent_cents, 500);
});

test("Concurrent wallet payments cannot spend the same manager funds twice", async (t) => {
  const m = await setup(t);
  await m.delivery(1000);
  const ids = [await m.bill(700), await m.bill(700)];
  const results = await Promise.all(
    ids.map((id, i) =>
      m.assistant(
        `/bills/${id}/payments`,
        "POST",
        payment(700, `SIMULTANEO-${i}`),
      ),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  const cash = (await m.manager("/cash")).data;
  assert.equal(cash.balance_cents, 300);
  assert.equal(cash.totals.spent, 700);
  assert.equal(cash.payment_activity.length, 1);
  assert.equal(cash.movements.filter((m) => m.kind === "expense").length, 1);
});

test("Historical funded wallet payments reconcile against their actual payment month", async (t) => {
  const m = await setup(t);
  await m.delivery(10000, "2025-01-01");
  const id = await m.bill(2500);
  assert.equal(
    (
      await m.assistant(
        `/bills/${id}/payments`,
        "POST",
        payment(2500, "HISTORICO-FONDO", {
          payment_date: "2025-01-03",
          method: "Yape",
        }),
      )
    ).status,
    201,
  );
  const cash = (await m.manager("/cash?month=2025-01")).data;
  assert.deepEqual(cash.totals, { delivered: 10000, spent: 2500, returned: 0 });
  assert.equal(cash.reconciliation.closing_cents, 7500);
  assert.equal(cash.payment_activity[0].payment_date, "2025-01-03");
  assert.equal(cash.payment_activity[0].fund_spent_cents, 2500);
  assert.equal(
    (await m.manager("/cash?month=2025-02")).data.payment_activity.length,
    0,
  );
});

test("The feed isolates assistants and surfaces inconsistent or duplicated ledger links without changing records", () => {
  const state = {
    bills: [{ id: 1 }, { id: 2 }],
    suppliers: [],
    loans: [],
    cash_movements: [],
    payments: [
      {
        id: 1,
        bill_id: 1,
        actor_id: 2,
        amount_cents: 1000,
        method: "Plin",
        funding_source: "manager_funds",
        payment_date: "2025-01-02",
        created_at: "2025-01-02T12:00:00Z",
      },
      {
        id: 2,
        bill_id: 2,
        actor_id: 3,
        amount_cents: 1000,
        method: "Plin",
        funding_source: "other_funds",
        payment_date: "2025-01-02",
        created_at: "2025-01-02T12:00:00Z",
      },
    ],
  };
  const people = [{ id: 2, name: "Asistente" }];
  const isolated = cashView(
    state,
    "2025-01",
    { id: 2, role: "assistant" },
    people,
  );
  assert.deepEqual(
    isolated.payment_activity.map((p) => p.id),
    [1],
  );
  assert.equal(isolated.payment_activity[0].reconciled, false);
  state.cash_movements = [1, 2].map((id) => ({
    id,
    kind: "expense",
    holder_id: 2,
    amount_cents: 1000,
    bill_id: 1,
    payment_id: 1,
    created_at: "2025-01-02T12:00:00Z",
  }));
  const before = JSON.stringify(state);
  const result = cashView(state, "2025-01", { id: 1, role: "owner" }, people);
  assert.equal(result.payment_activity.length, 2);
  assert.equal(
    result.payment_activity.find((p) => p.id === 1).reconciled,
    false,
  );
  assert.equal(
    result.payment_activity.find((p) => p.id === 1).fund_spent_cents,
    2000,
  );
  assert.equal(JSON.stringify(state), before);
});
