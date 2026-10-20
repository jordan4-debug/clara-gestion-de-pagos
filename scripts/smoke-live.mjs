import assert from "node:assert/strict";
const base = "https://clara-gestion-de-pagos.pages.dev";
const response = await fetch(base);
assert.equal(response.status, 200);
assert.ok((await response.text()).includes("Clara Gestión de Pagos"));
async function login(role) {
  const r = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({
      email:
        role === "owner" ? "propietario@demo.local" : "asistente@demo.local",
      password: role === "owner" ? "Propietario2026!" : "Asistente2026!",
    }),
  });
  const data = await r.json();
  assert.equal(r.status, 200, JSON.stringify(data));
  return { cookie: r.headers.get("set-cookie").split(";")[0], csrf: data.csrf };
}
async function call(session, path, method = "GET", body) {
  const r = await fetch(base + "/api" + path, {
    method,
    headers: {
      Origin: base,
      Cookie: session.cookie,
      "X-CSRF-Token": session.csrf,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
}
const owner = await login("owner"),
  assistant = await login("assistant");
assert.equal((await call(owner, "/auth/me")).data.user.role, "owner");
const assistantIdentity = (await call(assistant, "/auth/me")).data.user;
assert.equal(assistantIdentity.role, "assistant");
const first = await call(owner, "/dashboard"),
  second = await call(assistant, "/dashboard");
assert.equal(first.status, 200);
for (const [path, method] of [
  ["/finance", "GET"],
  ["/bills/1/simulate", "POST"],
  ["/bills/1/checkout", "POST"],
])
  assert.equal(
    (await call(owner, path, method, method === "POST" ? {} : undefined))
      .status,
    410,
  );
assert.equal((await call(owner, "/auth/me")).data.user.name, "Gerente de demo");
assert.deepEqual(first.data.bills, second.data.bills);
assert.equal(
  first.data.totals.total,
  first.data.totals.monthPaid + first.data.totals.pending,
);
for (const session of [owner, assistant]) {
  const loans = await call(session, "/loans");
  assert.equal(loans.status, 200);
  assert.ok(Array.isArray(loans.data));
  for (const loan of loans.data) {
    assert.equal(loan.installment_count, loan.installments.length);
    assert.equal(loan.total_cents, loan.paid_cents + loan.remaining_cents);
    for (const installment of loan.installments)
      assert.ok(first.data.all_bills.some((b) => b.id === installment.id));
  }
  const cash = await call(session, `/cash?month=${first.data.month}`);
  assert.equal(cash.status, 200);
  assert.ok(Array.isArray(cash.data.movements));
  assert.ok(cash.data.people.every((p) => p.balance_cents >= 0));
  if (session === assistant)
    assert.ok(cash.data.people.every((p) => p.id === assistantIdentity.id));
}
assert.equal((await call(owner, "/bills", "POST", {})).status, 403);
const suppliers = await call(owner, "/suppliers");
assert.equal(suppliers.status, 200);
assert.ok(
  suppliers.data.every((s) => !("account" in s) && !("payment_gateway" in s)),
);
assert.equal(
  first.data.overview.pending_count,
  first.data.bills.filter((b) => b.status !== "Pagado").length,
);
assert.equal(
  first.data.overview.overdue_count,
  first.data.bills.filter((b) => b.status === "Vencido").length,
);
assert.equal(first.data.overview.paid_cents, first.data.totals.paid);
const backup = await call(owner, "/export");
assert.equal(backup.status, 200);
assert.equal((await call(assistant, "/export")).status, 403);
assert.equal(
  (
    await call(assistant, "/settings", "PUT", {
      reminder_days: 3,
      recipient: "both",
    })
  ).status,
  403,
);
assert.equal((await call(owner, "/settings")).data.mode, "administrative");
const selected = first.data.month;
const report = await call(owner, `/reports?month=${selected}`);
assert.equal(report.status, 200);
assert.equal(report.data.totals.paid, first.data.totals.paid);
assert.equal((await call(assistant, `/reports?month=${selected}`)).status, 403);
assert.equal((await call(owner, `/reviews?month=${selected}`)).status, 200);
assert.equal((await call(assistant, `/reviews?month=${selected}`)).status, 200);
const team = await call(owner, "/team");
assert.equal(team.status, 200);
assert.equal(team.data.canManage, false);
assert.ok(team.data.members.every((m) => m.demo === 1));
assert.equal((await call(assistant, "/team")).status, 403);
await call(owner, "/auth/logout", "POST", {});
await call(assistant, "/auth/logout", "POST", {});
console.log(
  `PASS: ${base} · acceso, roles, préstamos y cuotas, totales mensuales, efectivo por asistente, comprobantes, equipo protegido y ${backup.data.state.bills.length} obligaciones; control administrativo sin procesamiento de dinero. No se alteraron obligaciones, efectivo ni comprobantes.`,
);
