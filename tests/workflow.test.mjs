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
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const result = [];
        for (const s of statements) result.push(await s.run());
        sqlite.exec("COMMIT");
        return result;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
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
    supplier_id: 1,
    amount_cents: 1000,
    due_date: "2027-02-20",
  });
  assert.deepEqual(
    (await assistant(`/bills/${id}`)).data.provider_payment.methods,
    ["Yape", "Plin"],
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

test("Created amounts are immutable for both roles while due dates can be corrected without manager approval", async () => {
  const { sqlite, client } = memory(),
    owner = client(),
    assistant = client();
  await demo(owner, "owner");
  await demo(assistant, "assistant");
  const input = {
    title: "Pago de importe fijo",
    supplier_id: 1,
    amount_cents: 90000,
    due_date: "2027-02-27",
  };
  const {
    data: { id },
  } = await assistant("/bills", "POST", input);
  assert.equal((await assistant(`/bills/${id}`)).data.approval, "approved");
  for (const call of [owner, assistant])
    assert.equal(
      (await call(`/bills/${id}`, "PATCH", { ...input, amount_cents: 1000 }))
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
