import { test } from "node:test";
import assert from "node:assert/strict";
import { memory } from "./helpers/memory.mjs";
import { readState, mutateState, dashboard } from "../server/cloud-state.mjs";
import {
  decimalCents,
  decimalText,
  receiptError,
  selectExpenses,
  validMoneyDraft,
  moneyPattern,
} from "../shared/expenses.mjs";
import { hashPassword } from "../server/passwords.mjs";
import { cashView } from "../server/cash.mjs";
const receipt = (name = "original.pdf") => ({
  name,
  mime: "application/pdf",
  base64: Buffer.from(
    "%PDF-1.4\nDocumento ficticio sin valor fiscal.",
  ).toString("base64"),
});
async function setup() {
  const m = memory(),
    manager = m.client(),
    assistant = m.client();
  for (const [call, role] of [
    [manager, "owner"],
    [assistant, "assistant"],
  ])
    assert.equal((await call("/auth/demo", "POST", { role })).status, 200);
  return { ...m, manager, assistant };
}
const input = (number = "0000123", extra = {}) => ({
  title: "Recibo de agua",
  supplier_id: 2,
  amount_cents: 2500,
  due_date: "2027-06-20",
  invoice_number: number,
  receipt_format: "numeric",
  invoice: receipt(),
  ...extra,
});
const payment = (amount = 2500, operation = "CONSTANCIA-001", extra = {}) => ({
  amount_cents: amount,
  method: "Transferencia",
  operation,
  receipt: receipt("constancia.pdf"),
  ...extra,
});
async function make(call, number = "0000123", extra = {}) {
  const r = await call("/bills", "POST", input(number, extra));
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.id;
}

test("Historical receipts, edits, payments and month reports accept earlier years without changing audit dates", async () => {
  const { sqlite, manager, assistant } = await setup();
  const id = await make(assistant, "002385", {
    due_date: "2025-10-30",
    issued_date: "2025-09-01",
    amount_cents: 12992,
  });
  const detail = (await assistant(`/bills/${id}`)).data;
  assert.equal(detail.status, "Vencido");
  const changed = await assistant(`/bills/${id}`, "PATCH", {
    title: detail.title,
    supplier_id: detail.supplier_id,
    amount_cents: detail.amount_cents,
    due_date: "2025-09-30",
    notes: "Vencimiento histórico corregido",
  });
  assert.equal(changed.status, 200);
  assert.equal(
    (
      await assistant(
        `/bills/${id}/payments`,
        "POST",
        payment(12992, "HISTORICO-2025", { payment_date: "2025-09-30" }),
      )
    ).status,
    201,
  );
  const report = (await manager("/dashboard?month=2025-09")).data;
  const saved = report.bills.find((bill) => bill.id === id);
  assert.equal(saved.month, "2025-09");
  assert.equal(saved.status, "Pagado");
  const p = (await manager(`/bills/${id}`)).data.payments[0];
  assert.equal(p.payment_date, "2025-09-30");
  assert.ok(p.created_at > "2025-09-30");
  const ancient = await make(assistant, "1998", { due_date: "1998-12-31" });
  assert.ok(
    (await manager("/dashboard?month=1998-12")).data.bills.some(
      (b) => b.id === ancient,
    ),
  );
  for (const due_date of ["2025-02-30", "1899-12-31", "2100-01-01"])
    assert.equal(
      (await assistant("/bills", "POST", input("INVALIDA", { due_date })))
        .status,
      400,
    );
  sqlite.close();
});

test("Historical cash uses actual movement/payment dates, prevents spending later funds and reconciles month carry-over", async () => {
  const { sqlite, db, manager, assistant } = await setup();
  const holder_id = (await manager("/cash")).data.people[0].id;
  const delivery = {
    kind: "delivery",
    holder_id,
    amount_cents: 1000,
    note: "Entrega real histórica",
    movement_date: "2025-10-01",
  };
  assert.equal((await manager("/cash", "POST", delivery)).status, 201);
  const id = await make(assistant, "HISTORICO", {
    receipt_format: "alphanumeric",
    due_date: "2025-09-30",
    amount_cents: 600,
  });
  const cashPayment = payment(600, "EFECTIVO-HISTORICO", {
    method: "Efectivo",
    payment_date: "2025-09-30",
  });
  const before = JSON.stringify((await readState(db)).state);
  assert.equal(
    (await assistant(`/bills/${id}/payments`, "POST", cashPayment)).status,
    409,
  );
  assert.equal(JSON.stringify((await readState(db)).state), before);
  assert.equal(
    (
      await manager("/cash", "POST", {
        ...delivery,
        movement_date: "2025-09-01",
      })
    ).status,
    201,
  );
  assert.equal(
    (await assistant(`/bills/${id}/payments`, "POST", cashPayment)).status,
    201,
  );
  assert.equal(
    (
      await assistant("/cash", "POST", {
        ...delivery,
        kind: "return",
        amount_cents: 400,
      })
    ).status,
    201,
  );
  const september = (await manager("/cash?month=2025-09")).data;
  assert.deepEqual(september.totals, {
    delivered: 1000,
    spent: 600,
    returned: 0,
  });
  assert.deepEqual(september.reconciliation, {
    opening_cents: 0,
    closing_cents: 400,
  });
  const october = (await manager("/cash?month=2025-10")).data;
  assert.deepEqual(october.reconciliation, {
    opening_cents: 400,
    closing_cents: 1000,
  });
  assert.equal(october.balance_cents, 1000);
  const expense = september.movements.find((m) => m.kind === "expense");
  assert.equal(expense.movement_date, "2025-09-30");
  assert.ok(expense.created_at > "2025-09-30");
  assert.equal(
    (await manager("/dashboard?month=2025-09")).data.cash_summary.spent,
    600,
  );
  for (const movement_date of ["2099-01-01", "2025-02-30"])
    assert.equal(
      (await manager("/cash", "POST", { ...delivery, movement_date })).status,
      400,
    );
  sqlite.close();
});

test("Legacy cash without an effective date keeps its original Lima accounting month", () => {
  const movement = {
    id: 1,
    holder_id: 2,
    kind: "delivery",
    amount_cents: 1000,
    created_at: "2025-10-01T01:00:00.000Z",
  };
  const state = { cash_movements: [movement] };
  assert.equal(
    cashView(state, "2025-09", { role: "owner" }, [{ id: 2 }]).totals.delivered,
    1000,
  );
  assert.equal(
    cashView(state, "2025-10", { role: "owner" }, [{ id: 2 }]).reconciliation
      .opening_cents,
    1000,
  );
  assert.equal(state.cash_movements[0].movement_date, undefined);
});

test("Numeric and alphanumeric receipt formats preserve valid pasted strings and leading zeroes", () => {
  for (const n of ["000001", "1234567890123456789012345678901234567890"])
    assert.equal(receiptError(n, "numeric"), "");
  for (const n of ["F001-0000123", "ab12/000045", "000045"])
    assert.equal(receiptError(n, "alphanumeric"), "");
  for (const n of ["001 23", "12a", "-123", " 000123", "1.5", "1e4"])
    assert.ok(receiptError(n, "numeric"));
  for (const n of ["F001 01", "AB__12", "-AB", "AB--01", "AB@12", "AB/"])
    assert.ok(receiptError(n, "alphanumeric"));
});

test("Exact monetary parsing rejects precision loss and formats two decimals", () => {
  assert.equal(decimalCents("25.00"), 2500);
  assert.equal(decimalCents("145.50"), 14550);
  assert.equal(decimalCents("1250.75"), 125075);
  assert.equal(decimalCents("0.10") + decimalCents("0.20"), 30);
  assert.equal(decimalText(2500), "25.00");
  assert.equal(decimalText(14550), "145.50");
  for (const value of [
    "1.005",
    "1e3",
    "25,50",
    "NaN",
    "-1",
    " 25.00",
    "1,25.00",
    "1,250.75",
    "100abc",
    "S/100.00",
    "10.1.2",
  ])
    assert.throws(() => decimalCents(value));
});

test("Money entry and pasted candidates allow digits and a single decimal point with at most two places", () => {
  for (const value of [
    "",
    "0",
    "10",
    "100.",
    "100.0",
    "100.00",
    "1250.75",
    ".5",
  ])
    assert.equal(validMoneyDraft(value), true, value);
  for (const value of [
    "abc",
    "100a",
    "1e3",
    "-1",
    "+1",
    "100.001",
    "10.1.2",
    "25,50",
    "1,000.00",
    "100\n",
    " 100",
    "S/100.00",
  ])
    assert.equal(validMoneyDraft(value), false, value);
  const pattern = new RegExp(`^(?:${moneyPattern})$`, "v");
  for (const value of ["100", "100.0", "100.00", "0.01"])
    assert.ok(pattern.test(value));
  for (const value of ["100a", "1.234", "1e3", "1,000.00", "100."])
    assert.ok(!pattern.test(value));
});

test("Assistant registers a backed receipt and the server rejects incompatible numbers without writing files", async () => {
  const { sqlite, db, assistant } = await setup();
  for (const number of ["12A", "00 123", "1.50"]) {
    assert.equal(
      (await assistant("/bills", "POST", input(number))).status,
      400,
    );
  }
  assert.equal((await readState(db)).state.receipts.length, 0);
  const id = await make(assistant);
  const detail = (await assistant(`/bills/${id}`)).data;
  assert.equal(detail.invoice_number, "0000123");
  assert.equal(detail.receipt_format, "numeric");
  assert.equal(detail.status, "Pendiente");
  assert.equal(detail.amount_cents, 2500);
  assert.equal(
    (await assistant(`/receipts/${detail.invoice_receipt_id}`)).status,
    200,
  );
  const alpha = await make(assistant, "F001-000123", {
    receipt_format: "alphanumeric",
  });
  assert.equal(
    (await assistant(`/bills/${alpha}`)).data.invoice_number,
    "F001-000123",
  );
  assert.equal(
    (
      await assistant(
        "/bills",
        "POST",
        input("000045", { amount_cents: 2500.1 }),
      )
    ).status,
    400,
  );
  sqlite.close();
});

test("Receipts inherit their entity category and reject category overrides before uploading", async () => {
  const { sqlite, db, assistant } = await setup();
  try {
    const before = (await readState(db)).state;
    for (const category of [
      "Proveedores",
      "Impuestos",
      "Alquiler",
      "Préstamos",
      "Otros",
    ]) {
      const response = await assistant(
        "/bills",
        "POST",
        input("000777", { category }),
      );
      assert.equal(response.status, 400, JSON.stringify(response.data));
      assert.match(response.data.error, /categoría.*proveedor o entidad/);
    }
    assert.deepEqual((await readState(db)).state, before);
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) AS n FROM receipt_files").get().n,
      0,
    );
    for (const supplier of before.suppliers.filter(
      (s) => s.category !== "Préstamos",
    )) {
      const id = await make(assistant, `000777${supplier.id}`, { supplier_id: supplier.id });
      const saved = (await readState(db)).state.bills.find((b) => b.id === id);
      assert.equal(saved.category, supplier.category, supplier.name);
      assert.equal(
        (await assistant(`/bills/${id}`)).data.category,
        supplier.category,
      );
    }
    const created = await assistant("/suppliers", "POST", {
      name: "Entidad nueva de mantenimiento",
      category: "Otros",
    });
    assert.equal(created.status, 200);
    const id = await make(assistant, `000777${created.data.id}`, {
      supplier_id: created.data.id,
      category: created.data.category,
    });
    assert.equal((await assistant(`/bills/${id}`)).data.category, "Otros");
  } finally {
    sqlite.close();
  }
});

test("A concurrent entity category change is rechecked before committing the receipt and cleans up its upload", async () => {
  const { sqlite, db, env, assistant, manager } = await setup();
  try {
    const before = (await readState(db)).state;
    const upload = env.BUCKET.put.bind(env.BUCKET);
    env.BUCKET.put = async (...args) => {
      await upload(...args);
      const changed = await assistant("/suppliers/2", "PUT", {
        name: "Sedalib",
        category: "Otros",
      });
      assert.equal(changed.status, 200);
    };
    const result = await assistant(
      "/bills",
      "POST",
      input("000888", { category: "Servicios" }),
    );
    assert.equal(result.status, 400);
    assert.match(result.data.error, /categoría.*proveedor o entidad/);
    const state = (await readState(db)).state;
    assert.deepEqual(state.bills, before.bills);
    assert.deepEqual(state.receipts, before.receipts);
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) AS n FROM receipt_files").get().n,
      0,
    );
  } finally {
    sqlite.close();
  }
});

test("Receipt numbers are unique across entities and months, ignore alphabetic case, preserve zeroes and survive concurrent creation", async () => {
  const { sqlite, db, assistant } = await setup();
  await make(assistant, "F001-000123", { receipt_format: "alphanumeric" });
  assert.equal(
    (
      await assistant(
        "/bills",
        "POST",
        input("f001-000123", { receipt_format: "alphanumeric" }),
      )
    ).status,
    409,
  );
  const unchanged = JSON.stringify((await readState(db)).state);
  const filesBefore = sqlite.prepare("SELECT COUNT(*) n FROM receipt_files").get().n;
  const duplicate = await assistant("/bills", "POST", input("f001-000123", {
    receipt_format: "alphanumeric",
    supplier_id: 1,
    due_date: "2025-01-01",
  }));
  assert.equal(duplicate.status, 409);
  assert.match(duplicate.data.error, /número de recibo ya está registrado/);
  assert.equal(JSON.stringify((await readState(db)).state), unchanged);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM receipt_files").get().n, filesBefore);
  // Significant leading zeroes are preserved, not coerced to a number.
  await make(assistant, "F001-0000123", { receipt_format: "alphanumeric", supplier_id: 1 });
  const results = await Promise.all([
    assistant("/bills", "POST", input("0000456", { supplier_id: 1 })),
    assistant("/bills", "POST", input("0000456")),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  const state = (await readState(db)).state;
  assert.equal(
    state.bills.filter((b) => b.invoice_number === "0000456").length,
    1,
  );
  assert.equal(state.receipts.length, 3);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM receipt_files").get().n, 3);
  sqlite.close();
});

test("Banking, simulator and gateway endpoints remain retired without deleting loan history", async () => {
  const { sqlite, db, manager, assistant } = await setup();
  await mutateState(db, (s) => {
    s.loans = [{ id: 42, title: "Contrato anterior" }];
    s.finance_periods = { "2026-10": { initial_cents: 50000 } };
  });
  const before = JSON.stringify((await readState(db)).state);
  for (const call of [manager, assistant])
    for (const [path, method] of [
      ["/finance", "GET"],
      ["/finance/2026-10", "PUT"],
      ["/bills/1/simulate", "POST"],
      ["/bills/1/checkout", "POST"],
      ["/payments/1/voucher", "GET"],
      ["/templates", "POST"],
      ["/months/generate", "POST"],
    ])
      assert.equal(
        (await call(path, method, method === "GET" ? undefined : {})).status,
        410,
        `${path} ${method}`,
      );
  assert.equal(JSON.stringify((await readState(db)).state), before);
  sqlite.close();
});

test("Both roles can register entities and retired reminder settings reject changes", async () => {
  const { sqlite, manager, assistant } = await setup();
  assert.equal((await manager("/bills", "POST", input())).status, 403);
  assert.equal(
    (
      await assistant("/suppliers", "POST", {
        name: "Entidad del asistente",
        category: "Servicios",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await manager("/suppliers", "POST", {
        name: "Entidad nueva",
        category: "Servicios",
        receipt_format: "numeric",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await manager("/suppliers", "POST", {
        name: "Entidad bancaria",
        category: "Servicios",
        account: "12345",
      })
    ).status,
    400,
  );
  const suppliers = (await assistant("/suppliers")).data;
  assert.ok(
    suppliers.every((s) => !("account" in s) && !("payment_gateway" in s)),
  );
  assert.equal(
    (
      await assistant("/settings", "PUT", {
        reminder_days: 3,
        recipient: "both",
      })
    ).status,
    410,
  );
  assert.equal(
    (
      await manager("/settings", "PUT", {
        reminder_days: 3,
        recipient: "owner",
      })
    ).status,
    410,
  );
  assert.deepEqual(
    (await assistant("/dashboard")).data.notifications,
    (await manager("/dashboard")).data.notifications,
  );
  sqlite.close();
});

test("An assistant cannot edit another assistant receipt or attach its original by forging a URL", async () => {
  const { sqlite, db, assistant, manager, client } = await setup();
  const id = await make(assistant);
  const hash = await hashPassword("OtraClaveSegura2026!");
  await db
    .prepare(
      "INSERT INTO accounts(email,name,role,password_hash,demo) VALUES(?,?,?,?,0)",
    )
    .bind("otro@ejemplo.test", "Otro asistente", "assistant", hash)
    .run();
  const other = client();
  assert.equal(
    (
      await other("/auth/login", "POST", {
        email: "otro@ejemplo.test",
        password: "OtraClaveSegura2026!",
      })
    ).status,
    200,
  );
  const detail = (await assistant(`/bills/${id}`)).data;
  assert.equal(
    (
      await other(`/bills/${id}`, "PATCH", {
        ...input(),
        due_date: "2027-07-20",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await other(`/bills/${id}/document`, "POST", {
        invoice_number: "000045",
        receipt_format: "numeric",
        receipt: receipt(),
      })
    ).status,
    403,
  );
  assert.equal((await manager(`/bills/${id}`, "PATCH", input())).status, 403);
  assert.equal(
    (
      await assistant(`/bills/${id}`, "PATCH", {
        ...input(),
        title: "Cambiar concepto",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await assistant(`/bills/${id}`, "PATCH", {
        ...input(),
        amount_cents: 3000,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await assistant(`/bills/${id}`, "PATCH", {
        ...input(),
        due_date: "2027-07-20",
        notes: "Según recibo",
      })
    ).status,
    200,
  );
  assert.equal(
    (await manager(`/bills/${id}`)).data.amount_cents,
    detail.amount_cents,
  );
  sqlite.close();
});

test("Pending debts use the selected month and may include future debts without mixing paid receipts", () => {
  const rows = [
    {
      id: 1,
      title: "Agua",
      supplier: "Sedalib",
      month: "2026-10",
      due_date: "2026-10-01",
      status: "Vencido",
    },
    {
      id: 2,
      title: "Luz",
      supplier: "Hidrandina",
      month: "2026-10",
      due_date: "2026-10-25",
      status: "Pendiente",
    },
    {
      id: 3,
      title: "Internet",
      supplier: "Movistar",
      month: "2026-10",
      due_date: "2026-10-04",
      status: "Pagado",
    },
    {
      id: 4,
      title: "Agua",
      supplier: "Sedalib",
      month: "2026-09",
      due_date: "2026-09-20",
      status: "Pagado",
    },
    {
      id: 5,
      title: "Préstamo · Cuota 2",
      supplier: "Caja Trujillo",
      month: "2026-11",
      due_date: "2026-11-25",
      status: "Pendiente",
      category: "Préstamos",
    },
    {
      id: 6,
      title: "Préstamo · Cuota 3",
      supplier: "Caja Trujillo",
      month: "2026-12",
      due_date: "2026-12-25",
      status: "Parcial",
      category: "Préstamos",
    },
    {
      id: 7,
      title: "Futura pagada",
      supplier: "Sedalib",
      month: "2026-11",
      due_date: "2026-11-01",
      status: "Pagado",
    },
    {
      id: 8,
      title: "Agua siguiente",
      supplier: "Sedalib",
      month: "2026-11",
      due_date: "2026-11-26",
      status: "Por definir",
    },
  ];
  const select = (tab) =>
    selectExpenses(rows, { month: "2026-10", tab }).map((b) => b.id);
  assert.deepEqual(select("all"), []);
  assert.deepEqual(select("month"), [1, 2]);
  assert.deepEqual(select("pending"), []);
  assert.deepEqual(
    selectExpenses(rows, {
      month: "2026-10",
      tab: "month",
      includeFuture: true,
    }).map((b) => b.id),
    [1, 2, 5, 8, 6],
  );
  assert.deepEqual(select("overdue"), [1]);
  assert.deepEqual(select("paid"), [3]);
  assert.deepEqual(
    selectExpenses(rows, {
      month: "2026-11",
      tab: "month",
      includeFuture: true,
      category: "Préstamos",
    }).map((b) => b.id),
    [5, 6],
  );
  assert.deepEqual(
    selectExpenses(rows, { month: "2026-11", tab: "paid" }).map((b) => b.id),
    [7],
  );
  assert.deepEqual(
    selectExpenses(rows, {
      month: "2026-10",
      tab: "month",
      includeFuture: true,
      query: "Sedalib",
    }).map((b) => b.id),
    [1, 8],
  );
  assert.deepEqual(
    selectExpenses(rows, {
      month: "2026-10",
      tab: "month",
      query: "Sedalib",
    }).map((b) => b.id),
    [1],
  );
});

test("Recorded payment keeps invoice and proof separate, stores payment date and updates debt without bank processing", async () => {
  const { sqlite, assistant, manager } = await setup();
  const id = await make(assistant);
  assert.equal(
    (
      await manager(
        `/bills/${id}/payments`,
        "POST",
        payment(2500, "GERENTE-001", { payment_date: "2026-10-19" }),
      )
    ).status,
    201,
  );
  const detail = (await assistant(`/bills/${id}`)).data;
  assert.equal(detail.status, "Pagado");
  assert.equal(detail.remaining_cents, 0);
  assert.equal(detail.last_payment_date, "2026-10-19");
  assert.equal(detail.payments[0].kind, "recorded");
  assert.notEqual(detail.invoice_receipt_id, detail.payments[0].receipt_id);
  assert.equal(
    (await assistant(`/bills/${id}/payments`, "POST", payment())).status,
    409,
  );
  assert.equal(
    (await manager("/dashboard?month=2027-06")).data.overview.pending_cents,
    0,
  );
  assert.equal(
    (await manager("/dashboard?month=2026-10")).data.overview.paid_cents,
    2500,
  );
  sqlite.close();
});

test("Insufficient original proof, future payment, duplicate operation and overpayment leave no partial writes", async () => {
  const { sqlite, db, assistant } = await setup();
  assert.equal(
    (await assistant("/bills/1/payments", "POST", payment())).status,
    409,
  );
  const id = await make(assistant);
  const state = JSON.stringify((await readState(db)).state);
  assert.equal(
    (await assistant(`/bills/${id}/payments`, "POST", payment(2501))).status,
    409,
  );
  assert.equal(
    (
      await assistant(
        `/bills/${id}/payments`,
        "POST",
        payment(2500, "FUTURO", { payment_date: "2099-01-01" }),
      )
    ).status,
    400,
  );
  assert.equal(JSON.stringify((await readState(db)).state), state);
  assert.equal(
    (await assistant(`/bills/${id}/payments`, "POST", payment(1000))).status,
    201,
  );
  assert.equal(
    (await assistant(`/bills/${id}/payments`, "POST", payment(1000))).status,
    409,
  );
  assert.equal((await assistant(`/bills/${id}`)).data.paid_cents, 1000);
  sqlite.close();
});

test("Payment codes cannot be reused across methods, roles or months, including concurrent submissions", async () => {
  const { sqlite, db, env, assistant, manager } = await setup();
  const first = await make(assistant, "PAGO-001", { receipt_format: "alphanumeric" });
  const second = await make(assistant, "PAGO-002", { receipt_format: "alphanumeric" });
  assert.equal((await assistant(`/bills/${first}/payments`, "POST", payment(1000, "OPERACION-ABC001", {
    payment_date: "2024-01-01",
    funding_source: "other_funds",
  }))).status, 201);
  let uploads = 0;
  const put = env.BUCKET.put.bind(env.BUCKET);
  env.BUCKET.put = async (...args) => { uploads++; return put(...args); };
  const before = JSON.stringify((await readState(db)).state);
  const files = sqlite.prepare("SELECT COUNT(*) n FROM receipt_files").get().n;
  for (const method of ["Transferencia", "Yape", "Plin", "Efectivo"]) {
    const result = await manager(`/bills/${second}/payments`, "POST", payment(1000, "  operacion-abc001  ", {
      method,
      payment_date: "2025-02-01",
      funding_source: "other_funds",
    }));
    assert.equal(result.status, 409, JSON.stringify(result.data));
    assert.match(result.data.error, /código de pago o número de operación ya está registrado/);
  }
  assert.equal(uploads, 0, "A known duplicate is rejected before storing its attachment");
  assert.equal(JSON.stringify((await readState(db)).state), before);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM receipt_files").get().n, files);
  const racing = await Promise.all([
    assistant(`/bills/${first}/payments`, "POST", payment(1000, "CONCURRENTE-42", { funding_source: "other_funds" })),
    manager(`/bills/${second}/payments`, "POST", payment(1000, "concurrente-42", { method: "Yape", funding_source: "other_funds" })),
  ]);
  assert.deepEqual(racing.map(r => r.status).sort(), [201, 409]);
  const state = (await readState(db)).state;
  assert.equal(state.payments.filter(p => p.operation.toUpperCase() === "CONCURRENTE-42").length, 1);
  assert.equal(state.bills.filter(b => [first, second].includes(b.id)).reduce((sum, b) => sum + b.paid_cents, 0), 2000);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM receipt_files").get().n, files + 1);
  assert.equal(state.receipts.length, files + 1, "Rejected concurrent attachments leave no orphan files");
  sqlite.close();
});

test("Attaching or completing a historical original cannot bypass global receipt uniqueness", async () => {
  const { sqlite, db, assistant, manager } = await setup();
  await make(assistant, "ORIGINAL-UNICO", { receipt_format: "alphanumeric" });
  // Historical obligations may have no original, or an archived original without a number.
  await mutateState(db, state => {
    delete state.bills.find(b => b.id === 1).invoice_receipt_id;
    delete state.bills.find(b => b.id === 1).invoice_number;
    state.bills.find(b => b.id === 2).invoice_receipt_id = state.receipts[0].id;
    delete state.bills.find(b => b.id === 2).invoice_number;
  });
  const before = JSON.stringify((await readState(db)).state);
  const files = sqlite.prepare("SELECT COUNT(*) n FROM receipt_files").get().n;
  for (const [path, method, payload] of [
    ["/bills/1/document", "POST", { receipt: receipt("mismo-nombre.pdf"), invoice_number: "original-unico", receipt_format: "alphanumeric" }],
    ["/bills/2/document", "PATCH", { invoice_number: "ORIGINAL-UNICO", receipt_format: "alphanumeric" }],
  ]) {
    const result = await manager(path, method, payload);
    assert.equal(result.status, 409, JSON.stringify(result.data));
    assert.match(result.data.error, /número de recibo ya está registrado/);
  }
  assert.equal(JSON.stringify((await readState(db)).state), before);
  assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM receipt_files").get().n, files);
  sqlite.close();
});

test("Cash delivery is not an expense or payment; expenses and returns reconcile per assistant", async () => {
  const { sqlite, db, manager, assistant } = await setup();
  const person = (await manager("/cash")).data.people[0];
  const before = (await manager("/dashboard")).data;
  const delivery = {
    kind: "delivery",
    holder_id: person.id,
    amount_cents: 1000,
    note: "Efectivo para recibos",
  };
  assert.equal((await assistant("/cash", "POST", delivery)).status, 403);
  assert.equal((await manager("/cash", "POST", delivery)).status, 201);
  const after = (await manager("/dashboard")).data;
  assert.equal(after.overview.paid_cents, before.overview.paid_cents);
  assert.deepEqual(after.bills, before.bills);
  assert.equal(after.cash_summary.delivered, 1000);
  const id = await make(assistant, "000555", { amount_cents: 600 });
  assert.equal(
    (
      await assistant(
        `/bills/${id}/payments`,
        "POST",
        payment(600, "CAJA-001", { method: "Efectivo", cash_holder_id: 999 }),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await assistant(
        `/bills/${id}/payments`,
        "POST",
        payment(600, "CAJA-001", { method: "Efectivo" }),
      )
    ).status,
    201,
  );
  assert.equal((await assistant("/cash")).data.balance_cents, 400);
  assert.equal(
    (
      await assistant("/cash", "POST", {
        ...delivery,
        kind: "return",
        amount_cents: 500,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await assistant("/cash", "POST", {
        ...delivery,
        kind: "return",
        amount_cents: 400,
      })
    ).status,
    201,
  );
  const cash = (await manager("/cash")).data;
  assert.deepEqual(cash.totals, { delivered: 1000, spent: 600, returned: 400 });
  assert.equal(cash.balance_cents, 0);
  assert.equal((await readState(db)).state.payments.length, 1);
  sqlite.close();
});

test("Concurrent cash payments cannot consume the same physical funds", async () => {
  const { sqlite, manager, assistant } = await setup();
  const holder = (await manager("/cash")).data.people[0].id;
  await manager("/cash", "POST", {
    kind: "delivery",
    holder_id: holder,
    amount_cents: 1000,
    note: "Entrega concurrente",
  });
  const ids = [
    await make(assistant, "00001", { amount_cents: 700 }),
    await make(assistant, "00002", { amount_cents: 700 }),
  ];
  const result = await Promise.all(
    ids.map((id, i) =>
      assistant(
        `/bills/${id}/payments`,
        "POST",
        payment(700, `CONCURRENTE-${i}`, { method: "Efectivo" }),
      ),
    ),
  );
  assert.deepEqual(result.map((r) => r.status).sort(), [201, 409]);
  assert.equal((await manager("/cash")).data.balance_cents, 300);
  sqlite.close();
});

test("Manager review and assistant correction retain old files and never change paid amounts", async () => {
  const { sqlite, assistant, manager } = await setup();
  const id = await make(assistant);
  await assistant(`/bills/${id}/payments`, "POST", payment());
  let detail = (await manager(`/bills/${id}`)).data;
  let p = detail.payments[0];
  const original = p.receipt_id;
  assert.equal(
    (
      await assistant(`/payments/${p.id}/review`, "POST", {
        status: "verified",
        revision: 0,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await manager(`/payments/${p.id}/review`, "POST", {
        status: "observed",
        revision: 0,
        note: "Se necesita una foto legible",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await assistant(`/payments/${p.id}/correction`, "POST", {
        receipt: receipt("corregida.pdf"),
        revision: 1,
        note: "Nueva imagen legible",
      })
    ).status,
    200,
  );
  detail = (await manager(`/bills/${id}`)).data;
  p = detail.payments[0];
  assert.equal(detail.paid_cents, 2500);
  assert.notEqual(p.receipt_id, original);
  assert.equal((await manager(`/receipts/${original}`)).status, 200);
  const results = await Promise.all([
    manager(`/payments/${p.id}/review`, "POST", {
      status: "verified",
      revision: 2,
    }),
    manager(`/payments/${p.id}/review`, "POST", {
      status: "observed",
      revision: 2,
      note: "Otra observación",
    }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  sqlite.close();
});

test("Summary includes loan installments and payment dates; past-due unknown amounts are still overdue", async () => {
  const { sqlite, db, manager } = await setup();
  await mutateState(db, (s) => {
    s.bills = [
      {
        id: 101,
        title: "Agua",
        supplier_id: 2,
        amount_cents: 2500,
        paid_cents: 1000,
        month: "2026-10",
        due_date: "2020-01-01",
      },
      {
        id: 102,
        title: "Monto pendiente",
        supplier_id: 1,
        amount_cents: null,
        paid_cents: 0,
        month: "2026-10",
        due_date: "2020-01-02",
      },
      {
        id: 103,
        title: "Crédito anterior",
        supplier_id: 7,
        loan_id: 1,
        amount_cents: 50000,
        paid_cents: 0,
        month: "2026-10",
        due_date: "2020-01-01",
      },
    ];
    s.payments = [
      {
        id: 1,
        bill_id: 101,
        amount_cents: 1000,
        created_at: "2026-11-01T04:00:00Z",
        payment_date: "2026-09-30",
      },
    ];
  });
  const d = (await manager("/dashboard?month=2026-10")).data;
  assert.equal(d.bills.length, 3);
  assert.equal(d.overview.pending_cents, 51500);
  assert.equal(d.overview.overdue_count, 3);
  assert.equal(d.overview.overdue_cents, 51500);
  assert.equal(d.overview.paid_cents, 0);
  assert.equal(d.overview.previous_cents, 1000);
  assert.equal(d.totals.undefined, 1);
  assert.equal((await manager("/bills/103")).status, 200);
  sqlite.close();
});

test("Direct links require a session; role changes, private team and exports are protected", async () => {
  const { sqlite, client, manager, assistant } = await setup(),
    visitor = client();
  for (const path of ["/dashboard", "/cash", "/receipts/1", "/bills/1"])
    assert.equal((await visitor(path)).status, 401);
  assert.equal((await assistant("/export")).status, 403);
  assert.equal((await assistant("/team")).status, 403);
  assert.equal(
    (
      await manager("/team", "POST", {
        name: "Intruso",
        email: "i@e.test",
        role: "owner",
        password: "PasswordSegura123",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await assistant("/settings", "PUT", {
        reminder_days: 0,
        recipient: "both",
        role: "owner",
      })
    ).status,
    410,
  );
  const me = (await manager("/auth/me")).data.user;
  assert.equal(me.name, "Gerente de demo");
  assert.equal((await manager("/export")).status, 200);
  sqlite.close();
});

test("Assistant creates and immediately uses an entity; normalized duplicates and edits to existing entities are protected", async () => {
  const { sqlite, db, assistant, manager } = await setup();
  const first = await assistant("/suppliers", "POST", {
    name: "Proveedor de Trujillo",
    category: "Servicios",
    receipt_format: "numeric",
  });
  assert.equal(first.status, 200);
  assert.ok(first.data.id);
  assert.ok(!("account" in first.data));
  const id = await make(assistant, "000009876", { supplier_id: first.data.id });
  assert.equal((await manager(`/bills/${id}`)).data.supplier, first.data.name);
  assert.equal(
    (
      await manager(`/suppliers/${first.data.id}`, "PUT", {
        name: "No permitido",
        category: "Servicios",
      })
    ).status,
    403,
  );
  const duplicates = await Promise.all([
    assistant("/suppliers", "POST", {
      name: "Entidad Concurrente",
      category: "Servicios",
    }),
    manager("/suppliers", "POST", {
      name: "  ENTIDAD   concurrente  ",
      category: "Servicios",
    }),
  ]);
  assert.deepEqual(duplicates.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    (await readState(db)).state.suppliers.filter((s) =>
      /concurrente/i.test(s.name),
    ).length,
    1,
  );
  sqlite.close();
});

test("Manager can complete an original and register its payment without changing the assistant's record ownership", async () => {
  const { sqlite, manager, assistant } = await setup();
  const before = (await manager("/bills/1")).data;
  assert.equal(
    (
      await manager("/bills/1/document", "POST", {
        receipt: receipt(),
        invoice_number: "GER-0000123",
        receipt_format: "alphanumeric",
      })
    ).status,
    201,
  );
  const backed = (await manager("/bills/1")).data;
  assert.equal(backed.amount_cents, before.amount_cents);
  assert.equal(backed.created_by_id, before.created_by_id);
  assert.equal(
    (
      await manager("/bills/1/document", "POST", {
        receipt: receipt(),
        invoice_number: "REEMPLAZO",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await manager(
        "/bills/1/payments",
        "POST",
        payment(before.amount_cents, "GERENTE-PAGO-001"),
      )
    ).status,
    201,
  );
  assert.equal((await assistant("/bills/1")).data.status, "Pagado");
  assert.equal(
    (
      await manager("/bills/1", "PATCH", {
        title: before.title,
        supplier_id: before.supplier_id,
        amount_cents: 1,
        due_date: before.due_date,
      })
    ).status,
    403,
  );
  sqlite.close();
});

test("Up to 5 MiB is accepted and the next byte is rejected without saving metadata or chunks", async () => {
  const { sqlite, db, assistant } = await setup();
  const buffer = Buffer.alloc(5 * 1024 * 1024, 32);
  buffer.write("%PDF-1.4");
  const invoice = {
    name: "cinco.pdf",
    mime: "application/pdf",
    base64: buffer.toString("base64"),
  };
  await make(assistant, "00555", { invoice });
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) n FROM receipt_chunks").get().n,
    80,
  );
  assert.equal(
    (
      await assistant(
        "/bills",
        "POST",
        input("00556", {
          invoice: {
            ...invoice,
            base64: Buffer.concat([buffer, Buffer.from("x")]).toString(
              "base64",
            ),
          },
        }),
      )
    ).status,
    400,
  );
  assert.equal((await readState(db)).state.receipts.length, 1);
  sqlite.close();
});

test("Frontend HTML patterns and server receipt validation accept exactly the same characters", async () => {
  const { receiptFormats } = await import("../shared/expenses.mjs");
  const samples = [
    "000001",
    "F001-00012",
    "AB/001",
    "12a",
    "001 23",
    "001.23",
    " AB12",
    "AB--12",
    "AB_12",
    "A".repeat(61),
  ];
  for (const format of ["numeric", "alphanumeric"])
    for (const number of samples) {
      const browserPattern = new RegExp(
        `^(?:${receiptFormats[format].pattern})$`,
        "v",
      );
      assert.equal(
        browserPattern.test(number),
        receiptError(number, format) === "",
        `${format}: ${number}`,
      );
    }
});
