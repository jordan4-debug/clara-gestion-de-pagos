import { test } from "node:test";
import assert from "node:assert/strict";
import { memory } from "./helpers/memory.mjs";
import { readState, mutateState } from "../server/cloud-state.mjs";
import { createLoan, loanInput } from "../server/loans.mjs";
import { today } from "../server/domain.mjs";
import { hashPassword } from "../server/passwords.mjs";

async function setup() {
  const m = memory(),
    manager = m.client(),
    assistant = m.client();
  for (const [call, role] of [
    [manager, "owner"],
    [assistant, "assistant"],
  ])
    assert.equal((await call("/auth/demo", "POST", { role })).status, 200);
  const lenders = (await manager("/suppliers")).data;
  const lender = lenders.find((s) => s.category === "Préstamos");
  assert.ok(lender, "Existing loan entities must remain available");
  return { ...m, manager, assistant, lender };
}
const contract = (supplier_id, extra = {}) => ({
  title: "Préstamo de capital de trabajo",
  supplier_id,
  principal_cents: 100000,
  installment_cents: 35000,
  last_installment_cents: 33033,
  installments: 3,
  first_due_date: "2028-01-31",
  reference: "CONTRATO-001",
  notes: "Importes del contrato ya celebrado",
  ...extra,
});
const receipt = {
  name: "cuota.pdf",
  mime: "application/pdf",
  base64: Buffer.from("%PDF-1.4\nDocumento ficticio de prueba").toString(
    "base64",
  ),
};
async function make(m, extra = {}) {
  const result = await m.assistant(
    "/loans",
    "POST",
    contract(m.lender.id, extra),
  );
  assert.equal(result.status, 201, JSON.stringify(result.data));
  return (await m.assistant("/loans")).data.find(
    (l) => l.id === result.data.id,
  );
}

test("Manager retires an unpaid loan and all its installments from totals, preserving recoverable history", async () => {
  const m = await setup(),
    loan = await make(m);
  assert.equal(
    (await m.assistant(`/loans/${loan.id}/archive`, "POST", {})).status,
    403,
  );
  const before = (await readState(m.db)).state;
  assert.equal(
    (await m.manager(`/loans/${loan.id}/archive`, "POST", {})).status,
    200,
  );
  assert.ok(!(await m.manager("/loans")).data.some((l) => l.id === loan.id));
  assert.equal(
    (await m.manager(`/bills/${loan.installments[0].id}`)).status,
    404,
  );
  const dashboard = (await m.manager("/dashboard?month=2028-01")).data;
  assert.equal(dashboard.overview.pending_cents, 0);
  assert.ok(!dashboard.all_bills.some((b) => b.loan_id === loan.id));
  const after = (await readState(m.db)).state;
  assert.equal(after.bills.length, before.bills.length);
  assert.ok(after.loans.find((l) => l.id === loan.id).archived_at);
  assert.deepEqual(after.cash_movements, before.cash_movements);
  assert.deepEqual(after.payments, before.payments);
  assert.equal(
    (await m.manager(`/loans/${loan.id}/restore`, "POST", {})).status,
    200,
  );
  assert.deepEqual(
    (await m.manager("/loans")).data.find((l) => l.id === loan.id),
    loan,
  );
  await mutateState(m.db, (s) => {
    s.bills.find((b) => b.id === loan.installments[0].id).paid_cents = 1;
  });
  assert.equal(
    (await m.manager(`/loans/${loan.id}/archive`, "POST", {})).status,
    409,
  );
  m.sqlite.close();
});

test("Assistant registers fixed loan installments; manager supervises and month-end schedules recover their original day", async () => {
  const m = await setup();
  assert.equal((await m.client()("/loans")).status, 401);
  assert.equal(
    (await m.manager("/loans", "POST", contract(m.lender.id))).status,
    403,
  );
  const loan = await make(m);
  assert.equal(loan.total_cents, 103033);
  assert.equal(loan.remaining_cents, 103033);
  assert.equal(loan.paid_installments, 0);
  assert.deepEqual(
    loan.installments.map((b) => b.due_date),
    ["2028-01-31", "2028-02-29", "2028-03-31"],
  );
  assert.deepEqual(
    loan.installments.map((b) => b.amount_cents),
    [35000, 35000, 33033],
  );
  assert.ok(
    loan.installments.every(
      (b) =>
        b.category === "Préstamos" &&
        b.approval === "approved" &&
        b.created_by_id,
    ),
  );
  assert.deepEqual(
    (await m.manager("/loans")).data,
    (await m.assistant("/loans")).data,
  );
  const dashboard = (await m.manager("/dashboard?month=2028-02")).data;
  assert.equal(dashboard.bills.filter((b) => b.loan_id === loan.id).length, 1);
  assert.equal(dashboard.overview.pending_cents, 35000);
  assert.equal(
    dashboard.all_bills.filter((b) => b.loan_id === loan.id).length,
    3,
  );
  m.sqlite.close();
});

test("Ordinary February, one final installment and the full due day are handled without premature expiration", async () => {
  const m = await setup();
  const loan = await make(m, { first_due_date: "2027-01-31" });
  assert.deepEqual(
    loan.installments.map((b) => b.due_date),
    ["2027-01-31", "2027-02-28", "2027-03-31"],
  );
  const one = await make(m, {
    reference: "UNICA",
    installments: 1,
    first_due_date: today(),
  });
  assert.equal(one.installments.length, 1);
  assert.equal(one.total_cents, 33033);
  assert.equal(one.installments[0].status, "Pendiente");
  assert.equal(one.overdue_installments, 0);
  m.sqlite.close();
});

test("Invalid and duplicate contracts cannot leave partial schedules, including simultaneous submissions", async () => {
  const m = await setup();
  const before = JSON.stringify((await readState(m.db)).state);
  for (const extra of [
    { installments: 0 },
    { installments: 121 },
    { installment_cents: 0 },
    { principal_cents: 1.25 },
    { last_installment_cents: -1 },
    { first_due_date: "2027-02-30" },
    { first_due_date: "2020-01-01" },
    { supplier_id: 1 },
  ])
    assert.equal(
      (await m.assistant("/loans", "POST", contract(m.lender.id, extra)))
        .status,
      400,
    );
  assert.equal(JSON.stringify((await readState(m.db)).state), before);
  const requests = await Promise.all([
    m.assistant("/loans", "POST", contract(m.lender.id)),
    m.assistant(
      "/loans",
      "POST",
      contract(m.lender.id, { reference: "contrato-001" }),
    ),
  ]);
  assert.deepEqual(requests.map((r) => r.status).sort(), [201, 409]);
  const loans = (await m.assistant("/loans")).data;
  assert.equal(loans.length, 1);
  assert.equal(loans[0].installments.length, 3);
  // A lender obligation must be generated from the contract, not entered twice as a service receipt.
  assert.equal(
    (
      await m.assistant("/bills", "POST", {
        title: "Cuota duplicada",
        supplier_id: m.lender.id,
        amount_cents: 35000,
        due_date: "2028-01-31",
        invoice_number: "001",
        invoice: receipt,
      })
    ).status,
    400,
  );
  m.sqlite.close();
});

test("A backed installment payment updates the loan, monthly debt and cash ledger without changing the original amount", async () => {
  const m = await setup();
  const loan = await make(m),
    bill = loan.installments[0];
  const patch = {
    title: bill.title,
    supplier_id: bill.supplier_id,
    amount_cents: 1,
    due_date: bill.due_date,
    category: "Préstamos",
  };
  assert.equal(
    (await m.assistant(`/bills/${bill.id}`, "PATCH", patch)).status,
    409,
  );
  const payment = {
    amount_cents: 35000,
    method: "Efectivo",
    operation: "CUOTA-REALIZADA-001",
    receipt,
    payment_date: today(),
  };
  assert.equal(
    (await m.manager(`/bills/${bill.id}/payments`, "POST", payment)).status,
    409,
  );
  assert.equal(
    (
      await m.assistant(`/bills/${bill.id}/document`, "POST", {
        receipt,
        invoice_number: "0000567",
        receipt_format: "numeric",
      })
    ).status,
    201,
  );
  const person = (await m.assistant("/auth/me")).data.user;
  assert.equal(
    (
      await m.manager("/cash", "POST", {
        kind: "delivery",
        holder_id: person.id,
        amount_cents: 35000,
        note: "Efectivo para la cuota",
      })
    ).status,
    201,
  );
  assert.equal(
    (await m.assistant(`/bills/${bill.id}/payments`, "POST", payment)).status,
    201,
  );
  const updated = (await m.manager("/loans")).data.find(
    (l) => l.id === loan.id,
  );
  assert.equal(updated.paid_cents, 35000);
  assert.equal(updated.remaining_cents, 68033);
  assert.equal(updated.paid_installments, 1);
  assert.equal(updated.next_due_date, "2028-02-29");
  assert.equal(updated.installments[0].amount_cents, 35000);
  assert.equal(updated.installments[0].status, "Pagado");
  const month = (await m.manager("/dashboard?month=2028-01")).data;
  assert.equal(month.overview.pending_cents, 0);
  assert.equal(month.overview.paid_count, 1);
  assert.equal((await m.assistant("/cash")).data.balance_cents, 0);
  const record = (await m.manager(`/bills/${bill.id}`)).data;
  assert.equal(record.payments[0].operation, payment.operation);
  assert.equal(
    (
      await m.assistant(`/bills/${bill.id}/payments`, "POST", {
        ...payment,
        operation: "REPETIDO",
      })
    ).status,
    409,
  );
  m.sqlite.close();
});

test("Historical loan balances survive reopening and new contracts never reuse old IDs", async () => {
  const m = await setup();
  const user = (await m.assistant("/auth/me")).data.user;
  await mutateState(m.db, (s) => {
    s.next.loans = 42;
    const { id } = createLoan(s, loanInput.parse(contract(m.lender.id)), user);
    const bill = s.bills.find((b) => b.loan_id === id);
    bill.paid_cents = 12000;
    for (const b of s.bills.filter((b) => b.loan_id === id))
      delete b.created_by_id;
    s.next.loans = 1;
  });
  const before = JSON.stringify((await readState(m.db)).state);
  const history = (await m.manager("/loans")).data[0];
  assert.equal(history.id, 42);
  assert.equal(history.paid_cents, 12000);
  assert.equal(history.remaining_cents, 91033);
  assert.equal(JSON.stringify((await readState(m.db)).state), before);
  const fresh = await make(m, { reference: "CONTRATO-002" });
  assert.equal(fresh.id, 43);
  assert.deepEqual(
    (await m.manager("/loans")).data.find((l) => l.id === 42),
    history,
  );
  m.sqlite.close();
});

test("Loan due dates stay with the responsible assistant and other assistants cannot attach its original", async () => {
  const m = await setup();
  const loan = await make(m),
    bill = loan.installments[0];
  const hash = await hashPassword("PasswordSegura123");
  m.sqlite
    .prepare(
      "INSERT INTO accounts(name,email,password_hash,role,active,demo) VALUES(?,?,?,?,1,0)",
    )
    .run("Otro asistente", "otro@example.test", hash, "assistant");
  const other = m.client();
  assert.equal(
    (
      await other("/auth/login", "POST", {
        email: "otro@example.test",
        password: "PasswordSegura123",
      })
    ).status,
    200,
  );
  const patch = {
    title: bill.title,
    supplier_id: bill.supplier_id,
    amount_cents: bill.amount_cents,
    category: "Préstamos",
    due_date: "2028-02-01",
    notes: "Fecha acordada",
  };
  assert.equal((await other(`/bills/${bill.id}`, "PATCH", patch)).status, 403);
  assert.equal(
    (await m.manager(`/bills/${bill.id}`, "PATCH", patch)).status,
    403,
  );
  assert.equal(
    (
      await other(`/bills/${bill.id}/document`, "POST", {
        receipt,
        invoice_number: "AJENA-01",
      })
    ).status,
    403,
  );
  assert.equal(
    (await m.assistant(`/bills/${bill.id}`, "PATCH", patch)).status,
    200,
  );
  const updated = (await m.manager("/loans")).data[0];
  assert.equal(updated.next_due_date, "2028-02-01");
  assert.equal(updated.installments[0].amount_cents, bill.amount_cents);
  m.sqlite.close();
});
