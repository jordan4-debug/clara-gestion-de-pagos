import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { handleRequest } from "../server/api.mjs";
import { fileStore } from "../server/storage.mjs";
import { hashPassword } from "../server/passwords.mjs";
import { readState, mutateState } from "../server/cloud-state.mjs";

function memory() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  for (const f of readdirSync("migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sqlite.exec(readFileSync("migrations/" + f, "utf8"));
  let batches = Promise.resolve();
  const db = {
    prepare(sql) {
      let values = [];
      return {
        bind(...args) {
          values = args;
          return this;
        },
        async first() {
          return sqlite.prepare(sql).get(...values);
        },
        async all() {
          return { results: sqlite.prepare(sql).all(...values) };
        },
        async run() {
          return {
            meta: { changes: sqlite.prepare(sql).run(...values).changes },
          };
        },
      };
    },
    batch(statements) {
      const transaction = batches.then(async () => {
        sqlite.exec("BEGIN");
        try {
          const result = [];
          for (const statement of statements)
            result.push(await statement.run());
          sqlite.exec("COMMIT");
          return result;
        } catch (error) {
          sqlite.exec("ROLLBACK");
          throw error;
        }
      });
      batches = transaction.catch(() => {});
      return transaction;
    },
  };
  const env = { DB: db, BUCKET: fileStore(db), DEMO_MODE: "true" };
  function client() {
    let cookie = "",
      csrf = "";
    return async (path, method = "GET", body) => {
      const res = await handleRequest(
        new Request("https://clara.example/api" + path, {
          method,
          headers: {
            Origin: "https://clara.example",
            Cookie: cookie,
            "X-CSRF-Token": csrf,
            "Content-Type": "application/json",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
        env,
      );
      if (res.headers.get("set-cookie"))
        cookie = res.headers.get("set-cookie").split(";")[0];
      const data = res.headers.get("content-type")?.includes("json")
        ? await res.json()
        : await res.text();
      if (data.csrf) csrf = data.csrf;
      return { status: res.status, data };
    };
  }
  return { sqlite, db, env, client };
}

test("Loans generate monthly fixed installments, preserve end-of-month dates and prevent duplicate contracts", async () => {
  const { sqlite, client } = memory(),
    assistant = client();
  await demo(assistant, "assistant");
  const suppliers = (await assistant("/suppliers")).data;
  const lender = suppliers.find((s) => s.category === "Préstamos");
  assert.ok(lender);
  const input = {
    title: "Préstamo para probar cuotas",
    supplier_id: lender.id,
    principal_cents: 30000,
    installment_cents: 10000,
    last_installment_cents: 15000,
    installments: 3,
    first_due_date: "2027-01-31",
    reference: "CONTRATO-FICTICIO-001",
    notes: "",
  };
  const create = await assistant("/loans", "POST", input);
  assert.equal(create.status, 201, JSON.stringify(create.data));
  const loan = (await assistant("/loans")).data.find(
    (l) => l.id === create.data.id,
  );
  assert.deepEqual(
    loan.installments.map((b) => b.due_date),
    ["2027-01-31", "2027-02-28", "2027-03-31"],
  );
  assert.deepEqual(
    loan.installments.map((b) => b.amount_cents),
    [10000, 10000, 15000],
  );
  assert.equal(loan.total_cents, 35000);
  assert.equal(loan.remaining_cents, 35000);
  assert.equal(loan.installment_count, 3);
  assert.equal((await assistant("/loans", "POST", input)).status, 409);
  assert.equal(
    (
      await assistant("/loans", "POST", {
        ...input,
        reference: "INVALIDO",
        installments: 0,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await assistant(`/bills/${loan.installments[0].id}/document`, "POST", {
        receipt: receipt(),
        invoice_number: "CUOTA-001",
      })
    ).status,
    201,
  );
  const bill = loan.installments[0],
    patch = {
      title: bill.title,
      supplier_id: bill.supplier_id,
      amount_cents: 12000,
      due_date: bill.due_date,
      notes: "",
    };
  assert.equal(
    (await assistant(`/bills/${bill.id}`, "PATCH", patch)).status,
    409,
  );
  assert.equal(
    (
      await assistant(`/bills/${bill.id}/payments`, "POST", {
        amount_cents: 10000,
        method: "Transferencia",
        operation: "CUOTA-FICTICIA-001",
        receipt: receipt(),
      })
    ).status,
    201,
  );
  const updated = (await assistant("/loans")).data.find(
    (l) => l.id === loan.id,
  );
  assert.equal(updated.paid_installments, 1);
  assert.equal(updated.remaining_cents, 25000);
  sqlite.close();
});

test("Payment methods are configured per provider and rejected when unavailable", async () => {
  const { sqlite, client } = memory(),
    owner = client(),
    assistant = client();
  await demo(owner, "owner");
  await demo(assistant, "assistant");
  const supplier = (await owner("/suppliers")).data.find((s) => s.id === 1);
  assert.equal(
    (
      await owner("/suppliers/1", "PUT", {
        ...supplier,
        payment_gateway: "manual",
        payment_methods: ["Yape", "Plin"],
      })
    ).status,
    200,
  );
  const {
    data: { id },
  } = await assistant("/bills", "POST", {
    title: "Método por proveedor",
    invoice: receipt(),
    invoice_number: "F001-PRUEBA-001",
    supplier_id: 1,
    amount_cents: 1000,
    due_date: "2027-02-20",
  });
  assert.deepEqual(
    (await assistant(`/bills/${id}`)).data.provider_payment.methods,
    ["Yape", "Plin", "Efectivo"],
  );
  const pay = {
    amount_cents: 1000,
    method: "Transferencia",
    operation: "METODO-FICTICIO-001",
    receipt: receipt(),
  };
  assert.equal(
    (await assistant(`/bills/${id}/payments`, "POST", pay)).status,
    400,
  );
  assert.equal(
    (
      await assistant(`/bills/${id}/payments`, "POST", {
        ...pay,
        method: "Yape",
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await assistant("/suppliers/1", "PUT", {
        ...supplier,
        payment_methods: ["Otro"],
      })
    ).status,
    403,
  );
  sqlite.close();
});

test("Provider changes preserve the destination snapshot and payments do not require manager approval", async () => {
  const { sqlite, client } = memory(),
    owner = client(),
    assistant = client();
  await demo(owner, "owner");
  await demo(assistant, "assistant");
  const {
    data: { id },
  } = await assistant("/bills", "POST", {
    title: "Abono parcial y cambio de cuenta",
    invoice: receipt(),
    invoice_number: "F001-PRUEBA-001",
    supplier_id: 1,
    amount_cents: 90000,
    due_date: "2026-10-28",
  });
  await owner(`/bills/${id}/approval`, "POST", { approval: "approved" });
  await assistant(`/bills/${id}/payments`, "POST", {
    amount_cents: 1000,
    method: "Transferencia",
    operation: "CAMBIO-DESTINO-001",
    receipt: receipt(),
  });
  assert.equal(
    (
      await owner("/settings", "PUT", {
        threshold_cents: 50000,
        reminder_days: 7,
        recipient: "both",
      })
    ).status,
    200,
  );
  assert.equal((await assistant(`/bills/${id}`)).data.approval, "approved");
  const supplier = (await owner("/suppliers")).data.find((s) => s.id === 1);
  assert.equal(
    (
      await owner("/suppliers/1", "PUT", {
        ...supplier,
        bank: "Banco ficticio para prueba",
        account: "CUENTA-FICTICIA-002",
      })
    ).status,
    200,
  );
  const bill = (await assistant(`/bills/${id}`)).data;
  assert.equal(bill.approval, "approved");
  assert.equal(bill.paid_cents, 1000);
  assert.equal(bill.payments[0].destination.account, "");
  assert.equal(
    (
      await assistant(`/bills/${id}/payments`, "POST", {
        amount_cents: 1000,
        method: "Transferencia",
        operation: "CAMBIO-DESTINO-002",
        receipt: receipt(),
      })
    ).status,
    201,
  );
  sqlite.close();
});
const receipt = (name = "constancia.pdf") => ({
  name,
  mime: "application/pdf",
  base64: Buffer.from(
    "%PDF-1.4\nConstancia ficticia sin valor bancario.",
  ).toString("base64"),
});
async function demo(call, role) {
  assert.equal((await call("/auth/demo", "POST", { role })).status, 200);
}

test("Receipt observation, correction and review preserve balances, files and concurrent revision guards", async () => {
  const { sqlite, db, client } = memory(),
    owner = client(),
    assistant = client();
  await demo(owner, "owner");
  await demo(assistant, "assistant");
  const create = await assistant("/bills", "POST", {
    title: "Constancia para revisar",
    invoice: receipt(),
    invoice_number: "F001-PRUEBA-001",
    supplier_id: 1,
    amount_cents: 1000,
    due_date: "2026-10-24",
  });
  const id = create.data.id;
  assert.equal(
    (
      await assistant(`/bills/${id}/payments`, "POST", {
        amount_cents: 1000,
        method: "Transferencia",
        operation: "FICTICIO-001",
        receipt: receipt(),
      })
    ).status,
    201,
  );
  let queue = (await owner("/reviews?month=2026-10")).data;
  let p = queue.find((p) => p.bill_id === id);
  const original = p.receipt_id;
  assert.equal(p.review_status, "pending");
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
      await owner(`/payments/${p.id}/review`, "POST", {
        status: "observed",
        note: "",
        revision: 0,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await owner(`/payments/${p.id}/review`, "POST", {
        status: "observed",
        note: "La constancia está cortada.",
        revision: 0,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await owner(`/payments/${p.id}/review`, "POST", {
        status: "verified",
        revision: 0,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await assistant(`/payments/${p.id}/correction`, "POST", {
        receipt: receipt("corregida.pdf"),
        note: "Adjunté la constancia completa.",
        revision: 0,
      })
    ).status,
    409,
  );
  const countBefore = sqlite
    .prepare("SELECT COUNT(*) AS n FROM receipt_files")
    .get().n;
  assert.equal(
    (
      await assistant(`/payments/${p.id}/correction`, "POST", {
        receipt: receipt("corregida.pdf"),
        note: "Adjunté la constancia completa.",
        revision: 1,
      })
    ).status,
    200,
  );
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM receipt_files").get().n,
    countBefore + 1,
  );
  p = (await owner("/reviews?month=2026-10")).data.find(
    (p) => p.bill_id === id,
  );
  assert.equal(p.review_status, "pending");
  assert.notEqual(p.receipt_id, original);
  assert.equal(p.review_events.length, 2);
  assert.equal((await owner(`/receipts/${original}`)).status, 200);
  assert.equal(
    (
      await owner(`/payments/${p.id}/review`, "POST", {
        status: "verified",
        note: "Coinciden los datos.",
        revision: 2,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await assistant(`/payments/${p.id}/correction`, "POST", {
        receipt: receipt(),
        note: "No debe permitirse.",
        revision: 3,
      })
    ).status,
    409,
  );
  const bill = (await owner(`/bills/${id}`)).data;
  assert.equal(bill.paid_cents, 1000);
  assert.equal(bill.remaining_cents, 0);
  assert.equal(bill.payments.length, 1);
  assert.equal(bill.payments[0].review_status, "verified");
  assert.equal(bill.pending_reviews, 0);
  assert.equal(
    (await readState(db)).state.activity.filter(
      (a) => a.action === "Comprobante corregido",
    ).length,
    1,
  );
  sqlite.close();
});

test("A legacy abono without a receipt can be observed and repaired, but cannot be marked reviewed", async () => {
  const { sqlite, db, client } = memory(),
    owner = client(),
    assistant = client();
  await demo(owner, "owner");
  await demo(assistant, "assistant");
  await mutateState(db, (s) => {
    s.payments.push({
      id: s.next.payments++,
      bill_id: 1,
      amount_cents: 1000,
      created_at: "2026-10-18T12:00:00Z",
      receipt_id: null,
      actor: "Registro anterior",
    });
    s.bills.find((b) => b.id === 1).paid_cents = 1000;
  });
  let p = (await owner("/reviews?month=2026-10")).data[0];
  assert.equal(
    (
      await owner(`/payments/${p.id}/review`, "POST", {
        status: "verified",
        revision: 0,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await owner(`/payments/${p.id}/review`, "POST", {
        status: "observed",
        note: "Falta adjuntar la constancia.",
        revision: 0,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await assistant(`/payments/${p.id}/correction`, "POST", {
        receipt: receipt(),
        note: "Se adjunta la constancia faltante.",
        revision: 1,
      })
    ).status,
    200,
  );
  p = (await owner("/reviews?month=2026-10")).data[0];
  assert.equal(p.review_status, "pending");
  assert.ok(p.receipt_id);
  assert.equal((await owner(`/bills/1`)).data.paid_cents, 1000);
  sqlite.close();
});

test("Two simultaneous reviews preserve one decision and reject the stale decision", async () => {
  const { sqlite, client } = memory(),
    owner = client(),
    assistant = client();
  await demo(owner, "owner");
  await demo(assistant, "assistant");
  const {
    data: { id },
  } = await assistant("/bills", "POST", {
    title: "Revision concurrente",
    invoice: receipt(),
    invoice_number: "F001-PRUEBA-001",
    supplier_id: 1,
    amount_cents: 1000,
    due_date: "2026-10-25",
  });
  await assistant(`/bills/${id}/payments`, "POST", {
    amount_cents: 1000,
    method: "Transferencia",
    operation: "CONCURRENTE-001",
    receipt: receipt(),
  });
  const p = (await owner("/reviews?month=2026-10")).data[0];
  const results = await Promise.all([
    owner(`/payments/${p.id}/review`, "POST", {
      status: "verified",
      revision: 0,
    }),
    owner(`/payments/${p.id}/review`, "POST", {
      status: "observed",
      note: "Revisar la constancia.",
      revision: 0,
    }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const current = (await owner("/reviews?month=2026-10")).data[0];
  assert.equal(current.review_events.length, 1);
  assert.equal(current.review_revision, 1);
  sqlite.close();
});

test("Private team management denies demo administration, revokes disabled sessions and protects the acting owner", async () => {
  const { sqlite, client } = memory(),
    owner = client(),
    visitor = client(),
    assistant = client();
  const password = "Clave ficticia para tests 2026!";
  const hash = await hashPassword(password);
  sqlite
    .prepare(
      "INSERT INTO accounts(email,name,role,password_hash,demo) VALUES(?,?,?,?,0)",
    )
    .run("dueno@clara.example", "Propietario privado", "owner", hash);
  await demo(visitor, "owner");
  assert.equal(
    (
      await visitor("/team", "POST", {
        name: "No permitido",
        email: "no@clara.example",
        role: "owner",
        password,
      })
    ).status,
    403,
  );
  assert.equal(
    (await visitor("/team")).data.members.every((m) => m.demo === 1),
    true,
  );
  assert.equal(
    (
      await owner("/auth/login", "POST", {
        email: "dueno@clara.example",
        password,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await owner("/team", "POST", {
        name: "Asistente privado",
        email: "equipo@clara.example",
        role: "assistant",
        password,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await owner("/team", "POST", {
        name: "Duplicado",
        email: "equipo@clara.example",
        role: "assistant",
        password,
      })
    ).status,
    409,
  );
  const members = (await owner("/team")).data.members;
  assert.equal(members.length, 2);
  assert.equal(
    members.some((m) => "password_hash" in m),
    false,
  );
  const worker = members.find((m) => m.role === "assistant"),
    boss = members.find((m) => m.role === "owner");
  assert.equal(
    (await assistant("/auth/login", "POST", { email: worker.email, password }))
      .status,
    200,
  );
  assert.equal((await assistant("/team")).status, 403);
  assert.equal((await assistant("/reports?month=2026-10")).status, 403);
  assert.equal(
    (await owner(`/team/${boss.id}`, "PATCH", { active: false })).status,
    409,
  );
  assert.equal(
    (await owner(`/team/${worker.id}`, "PATCH", { active: false })).status,
    200,
  );
  assert.equal((await assistant("/dashboard")).status, 401);
  assert.equal(
    (await assistant("/auth/login", "POST", { email: worker.email, password }))
      .status,
    401,
  );
  assert.equal(
    (await owner(`/team/${worker.id}`, "PATCH", { active: true })).status,
    200,
  );
  assert.equal(
    (await assistant("/auth/login", "POST", { email: worker.email, password }))
      .status,
    200,
  );
  sqlite.close();
});

test("Only assistants register obligations and correct dates; created amounts stay fixed", async () => {
  const { sqlite, client } = memory(),
    owner = client(),
    assistant = client();
  await demo(owner, "owner");
  await demo(assistant, "assistant");
  const input = {
    title: "Pago de importe fijo",
    invoice: receipt(),
    invoice_number: "F001-PRUEBA-001",
    supplier_id: 1,
    amount_cents: 90000,
    due_date: "2027-02-27",
  };
  const {
    data: { id },
  } = await assistant("/bills", "POST", input);
  assert.equal((await assistant(`/bills/${id}`)).data.approval, "approved");
  assert.equal((await owner("/bills", "POST", input)).status, 403);
  assert.equal((await owner(`/bills/${id}`, "PATCH", input)).status, 403);
  assert.equal(
    (await assistant(`/bills/${id}`, "PATCH", { ...input, amount_cents: 1000 }))
      .status,
    409,
  );
  assert.equal(
    (
      await assistant(`/bills/${id}`, "PATCH", {
        ...input,
        due_date: "2027-03-01",
        notes: "Fecha corregida según recibo.",
      })
    ).status,
    200,
  );
  assert.equal((await assistant(`/bills/${id}`)).data.amount_cents, 90000);
  assert.equal((await assistant(`/bills/${id}`)).data.due_date, "2027-03-01");
  assert.equal(
    (await assistant(`/bills/${id}/approval`, "POST", { approval: "approved" }))
      .status,
    410,
  );
  assert.equal(
    (await assistant("/bills", "POST", { ...input, due_date: "2020-01-01" }))
      .status,
    400,
  );
  const variable = (await assistant("/dashboard")).data.bills.find(
    (b) => b.amount_cents === null,
  );
  const known = {
    title: variable.title,
    supplier_id: variable.supplier_id,
    amount_cents: 3000,
    due_date: variable.due_date,
    notes: "",
  };
  assert.equal(
    (await assistant(`/bills/${variable.id}`, "PATCH", known)).status,
    200,
  );
  assert.equal(
    (
      await assistant(`/bills/${variable.id}`, "PATCH", {
        ...known,
        amount_cents: 3500,
      })
    ).status,
    409,
  );
  sqlite.close();
});

test("Reports and dashboard agree at the Lima month boundary and count legacy receipts as pending", async () => {
  const { sqlite, db, client } = memory(),
    owner = client();
  await demo(owner, "owner");
  await mutateState(db, (s) => {
    s.payments.push({
      id: s.next.payments++,
      bill_id: 1,
      amount_cents: 1000,
      created_at: "2026-11-01T01:00:00Z",
      receipt_id: 999,
      actor: "Registro anterior",
    });
  });
  const report = (await owner("/reports?month=2026-10")).data;
  assert.equal(report.totals.paid, 1000);
  assert.equal(
    report.categories.reduce((n, c) => n + c.recorded, 0),
    1000,
  );
  assert.equal(report.trend.at(-1).recorded, 1000);
  assert.equal(report.recorded_count, 1);
  assert.equal(report.verified_count, 0);
  assert.equal(
    (await owner("/reviews?month=2026-10")).data[0].review_status,
    "pending",
  );
  assert.equal((await owner("/reports?month=2026-11")).data.totals.paid, 0);
  sqlite.close();
});

test("Original invoices are archived separately from payment vouchers and the owner cannot enter debts or loans", async () => {
  const { sqlite, db, client } = memory(),
    owner = client(),
    assistant = client();
  await demo(owner, "owner");
  await demo(assistant, "assistant");
  const input = {
    title: "Recibo de agua con evidencia",
    supplier_id: 2,
    amount_cents: 18000,
    due_date: "2027-02-20",
  };
  const before = (await readState(db)).state;
  assert.equal((await assistant("/bills", "POST", input)).status, 400);
  assert.equal((await readState(db)).state.bills.length, before.bills.length);
  const created = await assistant("/bills", "POST", {
    ...input,
    invoice: receipt(),
    invoice_number: "F001-PRUEBA-001",
  });
  assert.equal(created.status, 201);
  const detail = (await owner(`/bills/${created.data.id}`)).data;
  assert.ok(detail.invoice_receipt_id);
  assert.equal(detail.invoice_name, receipt().name);
  assert.ok(
    (await owner(`/receipts/${detail.invoice_receipt_id}`)).data.startsWith(
      "%PDF-",
    ),
  );
  assert.equal(
    (
      await assistant(`/bills/${detail.id}/document`, "POST", {
        receipt: receipt(),
        invoice_number: "F001-DUPLICADO",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await owner(`/bills/${detail.id}/document`, "POST", {
        receipt: receipt(),
      })
    ).status,
    403,
  );
  assert.equal((await owner("/loans", "POST", {})).status, 403);
  assert.equal(
    (await owner("/months/generate", "POST", { month: "2027-04" })).status,
    403,
  );
  assert.equal(
    (await owner(`/bills/${detail.id}/payments`, "POST", {})).status,
    403,
  );
  const voucher = await assistant(`/bills/${detail.id}/payments`, "POST", {
    amount_cents: 18000,
    method: "Transferencia",
    operation: "PAGO-PROPIETARIO-EXCEPCIONAL",
    receipt: receipt(),
  });
  assert.equal(voucher.status, 201);
  const paid = (await owner(`/bills/${detail.id}`)).data;
  assert.equal(paid.status, "Pagado");
  assert.notEqual(paid.invoice_receipt_id, paid.payments[0].receipt_id);
  assert.equal(paid.payments.length, 1);
  sqlite.close();
});

test("Cash deliveries, expenses and returns reconcile per assistant and rejected operations leave no partial changes", async () => {
  const { sqlite, db, client } = memory(),
    owner = client(),
    assistant = client();
  await demo(owner, "owner");
  await demo(assistant, "assistant");
  const person = (await owner("/cash")).data.people[0];
  assert.ok(person);
  const delivery = {
    kind: "delivery",
    holder_id: person.id,
    amount_cents: 1000,
    note: "Entrega ficticia para servicios",
  };
  assert.equal((await assistant("/cash", "POST", delivery)).status, 403);
  const created = await assistant("/bills", "POST", {
    title: "Servicio pagado en efectivo",
    supplier_id: 2,
    amount_cents: 600,
    due_date: "2027-02-20",
    invoice: receipt(),
    invoice_number: "F001-PRUEBA-001",
  });
  assert.equal(created.status, 201);
  const path = `/bills/${created.data.id}/payments`,
    payment = {
      amount_cents: 600,
      method: "Efectivo",
      operation: "CAJA-FICTICIA-001",
      receipt: receipt(),
    };
  assert.equal((await assistant(path, "POST", payment)).status, 409);
  assert.equal((await owner("/cash")).data.balance_cents, 0);
  assert.equal((await owner("/cash", "POST", delivery)).status, 201);
  assert.equal(
    (await assistant(path, "POST", { ...payment, cash_holder_id: 999 })).status,
    403,
  );
  assert.equal((await owner("/cash")).data.balance_cents, 1000);
  assert.equal((await assistant(path, "POST", payment)).status, 201);
  assert.equal((await owner("/cash")).data.balance_cents, 400);
  assert.equal((await assistant(path, "POST", payment)).status, 409);
  const refund = {
    kind: "return",
    holder_id: person.id,
    amount_cents: 500,
    note: "Devolución de efectivo no utilizado",
  };
  assert.equal((await assistant("/cash", "POST", refund)).status, 409);
  assert.equal(
    (await assistant("/cash", "POST", { ...refund, amount_cents: 400 })).status,
    201,
  );
  assert.equal((await owner("/cash")).data.balance_cents, 0);
  const state = (await readState(db)).state;
  assert.equal(state.cash_movements.length, 3);
  assert.equal(state.cash_movements[1].payment_id, state.payments[0].id);
  assert.equal(
    state.bills.find((b) => b.id === created.data.id).paid_cents,
    600,
  );
  sqlite.close();
});

test("Two concurrent cash payments cannot consume the same physical cash", async () => {
  const { sqlite, client } = memory(),
    owner = client(),
    assistant = client();
  await demo(owner, "owner");
  await demo(assistant, "assistant");
  const holder = (await owner("/cash")).data.people[0].id;
  await owner("/cash", "POST", {
    kind: "delivery",
    holder_id: holder,
    amount_cents: 1000,
    note: "Entrega de prueba concurrente",
  });
  const ids = [];
  for (const title of ["Primer recibo de prueba", "Segundo recibo de prueba"]) {
    const result = await assistant("/bills", "POST", {
      title,
      supplier_id: 2,
      amount_cents: 700,
      due_date: "2027-02-20",
      invoice: receipt(),
      invoice_number: "F001-PRUEBA-001",
    });
    assert.equal(result.status, 201);
    ids.push(result.data.id);
  }
  const results = await Promise.all(
    ids.map((id, i) =>
      assistant(`/bills/${id}/payments`, "POST", {
        amount_cents: 700,
        method: "Efectivo",
        operation: `EFECTIVO-CONCURRENTE-${i}`,
        receipt: receipt(),
      }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal((await owner("/cash")).data.balance_cents, 300);
  sqlite.close();
});

test("The monthly summary decreases only the remaining debt and retains totals across payment dates", async () => {
  const { sqlite, db, client } = memory(),
    owner = client(),
    assistant = client();
  await demo(owner, "owner");
  await demo(assistant, "assistant");
  const result = await assistant("/bills", "POST", {
    title: "Obligación mensual de prueba",
    supplier_id: 1,
    amount_cents: 1000,
    due_date: "2027-05-20",
    invoice: receipt(),
    invoice_number: "F001-PRUEBA-001",
  });
  assert.equal(result.status, 201);
  let totals = (await owner("/dashboard?month=2027-05")).data.totals;
  assert.equal(totals.total, 1000);
  assert.equal(totals.monthPaid, 0);
  assert.equal(totals.pending, 1000);
  await assistant(`/bills/${result.data.id}/payments`, "POST", {
    amount_cents: 400,
    method: "Transferencia",
    operation: "MES-DIFERENTE-001",
    receipt: receipt(),
  });
  totals = (await owner("/dashboard?month=2027-05")).data.totals;
  assert.equal(totals.total, 1000);
  assert.equal(totals.monthPaid, 400);
  assert.equal(totals.pending, 600);
  const previous = (await owner("/dashboard?month=2027-04")).data;
  assert.equal(previous.bills.length, 0);
  assert.equal(
    (await readState(db)).state.bills.some((b) => b.id === result.data.id),
    true,
  );
  sqlite.close();
});

test("Simulated payments atomically discount the monthly budget, generate authenticated vouchers and replay safely", async () => {
  const { sqlite, db, client } = memory(),
    owner = client(),
    assistant = client(),
    visitor = client();
  await demo(owner, "owner");
  await demo(assistant, "assistant");
  const month = (await owner("/dashboard")).data.today.slice(0, 7);
  assert.equal((await visitor("/finance")).status, 401);
  const config = {
    initial_cents: 2000,
    account: "DEMO-ORIGEN-001",
    revision: 0,
  };
  assert.equal(
    (await assistant(`/finance/${month}`, "PUT", config)).status,
    403,
  );
  assert.equal((await owner(`/finance/${month}`, "PUT", config)).status, 200);
  const made = await assistant("/bills", "POST", {
    title: "Tributo de prueba <script>alert(1)</script>",
    supplier_id: 4,
    amount_cents: 700,
    due_date: "2027-05-20",
    invoice: receipt(),
    invoice_number: "F001-SIM-001",
    service_reference: "DEMO-TRIBUTO-001",
  });
  assert.equal(made.status, 201, JSON.stringify(made.data));
  const path = `/bills/${made.data.id}/simulate`,
    body = { request_id: "11111111-1111-4111-8111-111111111111" };
  assert.equal((await owner(path, "POST", body)).status, 403);
  const results = await Promise.all([
    assistant(path, "POST", body),
    assistant(path, "POST", body),
  ]);
  assert.deepEqual(
    results.map((r) => r.status),
    [201, 201],
  );
  assert.equal(results[0].data.payment_id, results[1].data.payment_id);
  assert.equal(
    (await owner(`/finance?month=${month}`)).data.available_cents,
    1300,
  );
  const state = (await readState(db)).state;
  assert.equal(state.payments.length, 1);
  assert.equal(state.payments[0].kind, "simulated");
  assert.equal(
    (await assistant(`/bills/${made.data.id}`)).data.status,
    "Pagado",
  );
  const url = `/payments/${results[0].data.payment_id}/voucher`;
  assert.equal((await visitor(url)).status, 401);
  const voucher = await owner(url);
  assert.equal(voucher.status, 200);
  assert.ok(voucher.data.includes("SIN VALIDEZ BANCARIA"));
  assert.ok(voucher.data.includes("DEMO-ORIGEN-001"));
  assert.ok(voucher.data.includes("&lt;script&gt;"));
  assert.ok(!voucher.data.includes("<script>"));
  const before = JSON.stringify((await readState(db)).state);
  assert.equal(
    (
      await assistant(path, "POST", {
        request_id: "22222222-2222-4222-8222-222222222222",
      })
    ).status,
    409,
  );
  assert.equal(JSON.stringify((await readState(db)).state), before);
  sqlite.close();
});

test("Concurrent simulated payments cannot overspend and insufficient funds do not change debts, vouchers or balances", async () => {
  const { sqlite, db, client } = memory(),
    owner = client(),
    assistant = client();
  await demo(owner, "owner");
  await demo(assistant, "assistant");
  const month = (await owner("/dashboard")).data.month;
  await owner(`/finance/${month}`, "PUT", {
    initial_cents: 1000,
    account: "DEMO-ORIGEN-001",
    revision: 0,
  });
  const ids = [];
  for (let i = 0; i < 2; i++) {
    const made = await assistant("/bills", "POST", {
      title: `Cuenta concurrente ${i}`,
      supplier_id: 1,
      amount_cents: 700,
      due_date: "2027-05-20",
      invoice: receipt(),
      invoice_number: `F001-${i}`,
    });
    assert.equal(made.status, 201);
    ids.push(made.data.id);
  }
  const results = await Promise.all(
    ids.map((id, i) =>
      assistant(`/bills/${id}/simulate`, "POST", {
        request_id: `${i + 1}1111111-1111-4111-8111-111111111111`,
      }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  const state = (await readState(db)).state;
  assert.equal(state.payments.length, 1);
  assert.equal(
    ids
      .map((id) => state.bills.find((b) => b.id === id))
      .filter((b) => b.paid_cents === 700).length,
    1,
  );
  assert.equal(
    (await owner(`/finance?month=${month}`)).data.available_cents,
    300,
  );
  assert.equal(
    (
      await owner(`/finance/${month}`, "PUT", {
        initial_cents: 600,
        account: "DEMO-ORIGEN-001",
        revision: 1,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await owner(`/finance/${month}`, "PUT", {
        initial_cents: 2000,
        account: "DEMO-ORIGEN-001",
        revision: 0,
      })
    ).status,
    409,
  );
  sqlite.close();
});

test("Original invoice and its number are mandatory for legacy debts and loan installments before either payment path", async () => {
  const { sqlite, db, client } = memory(),
    assistant = client();
  await demo(assistant, "assistant");
  const old = (await assistant("/dashboard")).data.bills.find(
    (b) => b.amount_cents !== null,
  );
  const before = JSON.stringify((await readState(db)).state);
  assert.equal(
    (
      await assistant(`/bills/${old.id}/payments`, "POST", {
        amount_cents: old.amount_cents,
        method: "Transferencia",
        operation: "ORIGINAL-REQUERIDO",
        receipt: receipt(),
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await assistant(`/bills/${old.id}/simulate`, "POST", {
        request_id: "33333333-3333-4333-8333-333333333333",
      })
    ).status,
    409,
  );
  assert.equal(JSON.stringify((await readState(db)).state), before);
  assert.equal(
    (
      await assistant(`/bills/${old.id}/document`, "POST", {
        receipt: receipt(),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await assistant(`/bills/${old.id}/document`, "POST", {
        receipt: receipt(),
        invoice_number: "F001-LEGACY",
      })
    ).status,
    201,
  );
  const loan = await assistant("/loans", "POST", {
    title: "Prestamo con respaldo",
    supplier_id: 7,
    principal_cents: 1000,
    installment_cents: 1000,
    installments: 1,
    first_due_date: "2027-06-20",
  });
  const installment = (await assistant("/loans")).data.find(
    (l) => l.id === loan.data.id,
  ).installments[0];
  assert.equal(
    (
      await assistant(`/bills/${installment.id}/payments`, "POST", {
        amount_cents: 1000,
        method: "Transferencia",
        operation: "CUOTA-SIN-ORIGINAL",
        receipt: receipt(),
      })
    ).status,
    409,
  );
  sqlite.close();
});

test("The executive budget uses payment date in Lima independently of the debt month and isolates each monthly initial balance", async () => {
  const { sqlite, db, client } = memory(),
    owner = client();
  await demo(owner, "owner");
  await mutateState(db, (s) => {
    s.finance_periods = {
      "2026-11": { initial_cents: 3000, account: "DEMO-NOV-001", revision: 1 },
    };
    s.payments.push({
      id: s.next.payments++,
      bill_id: 1,
      amount_cents: 1000,
      created_at: "2026-12-01T04:59:59Z",
    });
  });
  const nov = (await owner("/dashboard?month=2026-11")).data.finance;
  assert.equal(nov.paid_cents, 1000);
  assert.equal(nov.available_cents, 2000);
  assert.equal(nov.projected_cents, 2000);
  const dec = (await owner("/finance?month=2026-12")).data;
  assert.equal(dec.configured, false);
  assert.equal(dec.paid_cents, 0);
  sqlite.close();
});

test("Invoice uploads accept exactly 5 MiB and reject the next byte without saving any file or debt", async () => {
  const { sqlite, db, client } = memory(),
    assistant = client();
  await demo(assistant, "assistant");
  const data = Buffer.alloc(5 * 1024 * 1024, 32);
  data.write("%PDF-1.4");
  const invoice = {
    name: "cinco-megabytes.pdf",
    mime: "application/pdf",
    base64: data.toString("base64"),
  };
  const input = {
    title: "Recibo de cinco megabytes",
    supplier_id: 1,
    amount_cents: 100,
    due_date: "2027-05-20",
    invoice_number: "F001-5MB",
    invoice,
  };
  const result = await assistant("/bills", "POST", input);
  assert.equal(result.status, 201, JSON.stringify(result.data));
  const state = (await readState(db)).state;
  const chunks = sqlite
    .prepare("SELECT COUNT(*) n FROM receipt_chunks")
    .get().n;
  assert.equal(chunks, 80);
  const oversized = Buffer.concat([data, Buffer.from("x")]);
  assert.equal(
    (
      await assistant("/bills", "POST", {
        ...input,
        invoice: { ...invoice, base64: oversized.toString("base64") },
      })
    ).status,
    400,
  );
  assert.equal((await readState(db)).state.bills.length, state.bills.length);
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) n FROM receipt_chunks").get().n,
    chunks,
  );
  sqlite.close();
});
