import { test } from "node:test";
import assert from "node:assert/strict";
import { memory } from "./helpers/memory.mjs";
import { readState, mutateState, addAudit } from "../server/cloud-state.mjs";
import { snapshotDigest } from "../server/maintenance.mjs";
import { hashPassword } from "../server/passwords.mjs";
const password = "Cuenta privada para pruebas 2026!";
const document = {
  name: "prueba.pdf",
  mime: "application/pdf",
  base64: Buffer.from("%PDF-1.4\nPrueba sin valor fiscal").toString("base64"),
};
const bill = {
  title: "Agua histórica",
  supplier_id: 2,
  amount_cents: 2500,
  due_date: "2025-09-30",
  invoice_number: "0002385",
  receipt_format: "numeric",
  invoice: document,
};
const confirmation = "VACIAR REGISTROS PARA PRESENTACION";
async function setup(t) {
  const m = memory();
  t.after(() => m.sqlite.close());
  const hash = await hashPassword(password);
  for (const role of ["owner", "assistant"])
    m.sqlite
      .prepare(
        "INSERT INTO accounts(email,name,role,password_hash,demo) VALUES(?,?,?,?,0)",
      )
      .run(role + "@clara.example", role, role, hash);
  m.env.DEMO_MODE = "false";
  const manager = m.client(),
    assistant = m.client();
  for (const [call, role] of [
    [manager, "owner"],
    [assistant, "assistant"],
  ])
    assert.equal(
      (
        await call("/auth/login", "POST", {
          email: role + "@clara.example",
          password,
        })
      ).status,
      200,
    );
  const holder = (await assistant("/auth/me")).data.user.id;
  const made = await assistant("/bills", "POST", bill);
  assert.equal(made.status, 201);
  assert.equal(
    (
      await manager("/cash", "POST", {
        kind: "delivery",
        holder_id: holder,
        amount_cents: 5000,
        note: "Fondo para pruebas",
        movement_date: "2025-09-01",
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await assistant(`/bills/${made.data.id}/payments`, "POST", {
        amount_cents: 2500,
        method: "Plin",
        funding_source: "manager_funds",
        payment_date: "2025-09-30",
        operation: "OP-TEST",
        receipt: document,
      })
    ).status,
    201,
  );
  const loan = await assistant("/loans", "POST", {
    title: "Contrato histórico",
    supplier_id: 7,
    principal_cents: 10000,
    annual_interest_percent: "12",
    installments: 2,
    first_due_date: "2025-07-31",
    double_months: [7],
  });
  assert.equal(loan.status, 201);
  assert.equal(
    (await manager(`/loans/${loan.data.id}/archive`, "POST", {})).status,
    200,
  );
  return { ...m, manager, assistant, billId: made.data.id };
}
const resetBody = (state, extra = {}) => ({
  confirmation,
  snapshot_sha256: snapshotDigest(state),
  password,
  ...extra,
});

test("Presentation reset preserves team and catalog, clears every period and document, keeps IDs safe and allows new records", async (t) => {
  const m = await setup(t);
  const before = (await readState(m.db)).state;
  const accounts = m.sqlite.prepare("SELECT * FROM accounts ORDER BY id").all();
  const team = (await m.manager("/team")).data;
  const result = await m.manager(
    "/maintenance/reset-records",
    "POST",
    resetBody(before),
  );
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.ok, true);
  assert.equal(result.data.files_deleted, before.receipts.length);
  const after = (await readState(m.db)).state;
  for (const key of [
    "bills",
    "loans",
    "payments",
    "receipts",
    "cash_movements",
    "templates",
  ])
    assert.deepEqual(after[key], [], key);
  assert.deepEqual(after.finance_periods, {});
  assert.deepEqual(after.settings, {});
  assert.deepEqual(after.suppliers, before.suppliers);
  assert.deepEqual(
    m.sqlite.prepare("SELECT * FROM accounts ORDER BY id").all(),
    accounts,
  );
  assert.deepEqual((await m.manager("/team")).data, team);
  assert.equal(after.activity.length, 1);
  assert.equal(after.activity[0].action, "Espacio preparado para presentación");
  for (const key of Object.keys(before.next))
    assert.ok(after.next[key] >= before.next[key], key);
  for (const table of ["receipt_files", "receipt_chunks"])
    assert.equal(
      m.sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,
      0,
    );
  for (const call of [m.manager, m.assistant]) {
    for (const month of ["2025-09", "2026-10", "2028-01"]) {
      const dashboard = (await call("/dashboard?month=" + month)).data;
      assert.deepEqual(dashboard.all_bills, []);
      assert.deepEqual(dashboard.notifications, []);
      assert.ok(Object.values(dashboard.totals).every((n) => n === 0));
      const cash = (await call("/cash?month=" + month)).data;
      assert.equal(cash.balance_cents, 0);
      assert.deepEqual(cash.totals, { delivered: 0, spent: 0, returned: 0 });
      assert.deepEqual(cash.payment_activity, []);
      assert.deepEqual(cash.movements, []);
    }
    assert.deepEqual((await call("/loans")).data, []);
  }
  for (const receipt of before.receipts)
    assert.equal((await m.manager("/receipts/" + receipt.id)).status, 404);
  assert.equal(
    (await m.assistant(`/bills/${m.billId}`, "PATCH", bill)).status,
    404,
  );
  const newBill = await m.assistant("/bills", "POST", bill);
  assert.equal(newBill.status, 201, JSON.stringify(newBill.data));
  assert.ok(newBill.data.id > Math.max(...before.bills.map((b) => b.id)));
  const original = (await m.assistant(`/bills/${newBill.data.id}`)).data
    .invoice_receipt_id;
  assert.ok(original > Math.max(...before.receipts.map((r) => r.id)));
});

test("Reset rejects visitors, assistants, demo managers, wrong confirmation/password and stale backups without changes", async (t) => {
  const m = await setup(t);
  const before = await readState(m.db);
  const body = resetBody(before.state);
  assert.equal(
    (await m.client()("/maintenance/reset-records", "POST", body)).status,
    401,
  );
  assert.equal(
    (await m.assistant("/maintenance/reset-records", "POST", body)).status,
    403,
  );
  m.env.DEMO_MODE = "true";
  const demo = m.client();
  await demo("/auth/demo", "POST", { role: "owner" });
  assert.equal(
    (await demo("/maintenance/reset-records", "POST", body)).status,
    403,
  );
  m.env.DEMO_MODE = "false";
  for (const [extra, status] of [
    [{ confirmation: "borrar" }, 400],
    [{ password: "incorrecta" }, 403],
    [{ snapshot_sha256: "0".repeat(64) }, 409],
  ])
    assert.equal(
      (
        await m.manager(
          "/maintenance/reset-records",
          "POST",
          resetBody(before.state, extra),
        )
      ).status,
      status,
    );
  assert.deepEqual(await readState(m.db), before);
  for (const receipt of before.state.receipts)
    assert.equal((await m.manager("/receipts/" + receipt.id)).status, 200);
});

test("A concurrent write invalidates the reset snapshot without deleting records or documents", async (t) => {
  const m = await setup(t);
  const before = (await readState(m.db)).state;
  const prepare = m.db.prepare.bind(m.db);
  let concurrent = true;
  m.db.prepare = (sql) => {
    const statement = prepare(sql);
    if (sql.startsWith("UPDATE shared_state SET payload=")) {
      const run = statement.run.bind(statement);
      statement.run = async () => {
        if (concurrent) {
          concurrent = false;
          await mutateState(m.db, (s) =>
            addAudit(
              s,
              "Otro usuario",
              "Cambio concurrente",
              "Debe quedar protegido",
            ),
          );
        }
        return run();
      };
    }
    return statement;
  };
  const result = await m.manager(
    "/maintenance/reset-records",
    "POST",
    resetBody(before),
  );
  assert.equal(result.status, 409);
  const after = (await readState(m.db)).state;
  for (const key of [
    "bills",
    "loans",
    "payments",
    "receipts",
    "cash_movements",
    "suppliers",
  ])
    assert.deepEqual(after[key], before[key]);
  assert.equal(after.activity[0].action, "Cambio concurrente");
  for (const receipt of before.receipts)
    assert.ok(await m.env.BUCKET.get(receipt.key));
});

test("Removed alert settings cannot be saved or returned; only the assistant edits entities", async (t) => {
  const m = await setup(t);
  await mutateState(m.db, (s) =>
    Object.assign(s.settings, {
      variation_enabled: true,
      variation_percent: 1,
      variation_min_cents: 1,
      reminder_days: 30,
      recipient: "owner",
    }),
  );
  for (const call of [m.manager, m.assistant]) {
    assert.deepEqual((await call("/settings")).data, {
      mode: "administrative",
    });
    for (const payload of [
      { reminder_days: 7 },
      { variation_enabled: true },
      { variation_percent: 20 },
    ])
      assert.equal((await call("/settings", "PUT", payload)).status, 410);
    const dashboard = (await call("/dashboard")).data;
    assert.ok(!("variation_summary" in dashboard));
    assert.deepEqual(dashboard.settings, { mode: "administrative" });
    assert.ok(!("variation" in (await call(`/bills/${m.billId}`)).data));
  }
  const entity = {
    name: "Entidad de prueba",
    category: "Servicios",
    receipt_format: "numeric",
  };
  const created = await m.assistant("/suppliers", "POST", entity);
  assert.equal(created.status, 200);
  assert.equal(
    (await m.manager(`/suppliers/${created.data.id}`, "PUT", entity)).status,
    403,
  );
  assert.equal(
    (
      await m.assistant(`/suppliers/${created.data.id}`, "PUT", {
        ...entity,
        name: "Entidad corregida",
      })
    ).status,
    200,
  );
});
