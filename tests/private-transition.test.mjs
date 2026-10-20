import { test } from "node:test";
import assert from "node:assert/strict";
import { memory } from "./helpers/memory.mjs";
import { hashPassword } from "../server/passwords.mjs";
import { cashView } from "../server/cash.mjs";

test("Private account transition preserves user IDs, cash holdings and permissions while removing demo access", async () => {
  const m = memory(),
    owner = m.client(),
    assistant = m.client();
  await owner("/auth/demo", "POST", { role: "owner" });
  const old = (await assistant("/auth/demo", "POST", { role: "assistant" }))
    .data.user;
  assert.equal(
    (
      await owner("/cash", "POST", {
        kind: "delivery",
        holder_id: old.id,
        amount_cents: 109000,
        note: "Entrega de prueba",
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await assistant("/cash", "POST", {
        kind: "return",
        holder_id: old.id,
        amount_cents: 5000,
        note: "Devolución de prueba",
      })
    ).status,
    201,
  );
  const hash = await hashPassword("CuentaPrivadaPrueba2026!");
  m.env.DEMO_MODE = "false";
  m.sqlite
    .prepare(
      "UPDATE accounts SET email=?,name=?,password_hash=?,demo=0 WHERE id=?",
    )
    .run("privada@clara.example", "Asistente privado", hash, old.id);
  m.sqlite.prepare("DELETE FROM demo_sessions").run();
  assert.equal((await assistant("/auth/me")).status, 401);
  const client = m.client();
  const login = await client("/auth/login", "POST", {
    email: "PRIVADA@clara.example",
    password: "CuentaPrivadaPrueba2026!",
  });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.id, old.id);
  assert.equal(login.data.user.demo, false);
  assert.equal((await client("/cash")).data.balance_cents, 104000);
  assert.equal((await client("/team")).status, 403);
  assert.equal(
    (await client("/auth/demo", "POST", { role: "owner" })).status,
    403,
  );
  assert.equal((await client("/public-config")).data.demo, false);
  m.sqlite.close();
});

test("Cash reconciliation uses the opening balance and selected month without subtracting transfers or future movements", () => {
  const state = {
    cash_movements: [
      {
        holder_id: 2,
        kind: "delivery",
        amount_cents: 10000,
        created_at: "2026-09-01T17:00:00Z",
      },
      {
        holder_id: 2,
        kind: "return",
        amount_cents: 2000,
        created_at: "2026-09-02T17:00:00Z",
      },
      {
        holder_id: 2,
        kind: "delivery",
        amount_cents: 5000,
        created_at: "2026-10-01T17:00:00Z",
      },
      {
        holder_id: 2,
        kind: "expense",
        amount_cents: 2500,
        created_at: "2026-10-02T17:00:00Z",
      },
      {
        holder_id: 2,
        kind: "return",
        amount_cents: 500,
        created_at: "2026-10-03T17:00:00Z",
      },
      {
        holder_id: 2,
        kind: "delivery",
        amount_cents: 9000,
        created_at: "2026-11-01T17:00:00Z",
      },
      {
        holder_id: 3,
        kind: "delivery",
        amount_cents: 999999,
        created_at: "2026-10-01T17:00:00Z",
      },
    ],
    payments: [{ method: "Transferencia", amount_cents: 85000 }],
  };
  const data = cashView(state, "2026-10", { id: 2, role: "assistant" }, [
    { id: 2, name: "Asistente", active: 1 },
  ]);
  assert.deepEqual(data.reconciliation, {
    opening_cents: 8000,
    closing_cents: 10000,
  });
  assert.deepEqual(data.totals, {
    delivered: 5000,
    spent: 2500,
    returned: 500,
  });
  assert.equal(data.balance_cents, 19000);
  assert.equal(
    data.reconciliation.opening_cents +
      data.totals.delivered -
      data.totals.spent -
      data.totals.returned,
    data.reconciliation.closing_cents,
  );
});
