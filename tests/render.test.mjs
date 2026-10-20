import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { createRequire } from "node:module";
test("Rendered manager and assistant screens expose only administrative actions and independent filters", async () => {
  const { outputFiles } = buildSync({
    stdin: {
      contents: `import React from 'react'; import { renderToStaticMarkup } from 'react-dom/server'; import {RoleOverview} from './src/features/RoleOverview'; import {Shell} from './src/components/Shell'; import {BillForm} from './src/features/EntityForms'; import {MoneyInput} from './src/components/MoneyInput'; import {Loans} from './src/features/Loans'; export {React,renderToStaticMarkup,RoleOverview,Shell,BillForm,MoneyInput,Loans};`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    jsx: "automatic",
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", outputFiles[0].text)(
    createRequire(import.meta.url),
    module,
    module.exports,
  );
  const m = module.exports;
  const e = m.React.createElement;
  const data = {
    bills: [],
    all_bills: [],
    month: "2026-10",
    totals: { total: 0, monthPaid: 0, undefined: 0 },
    overview: {
      paid_cents: 125075,
      pending_cents: 2500,
      overdue_cents: 1000,
      receipts: 4,
      paid_count: 2,
      pending_count: 2,
      overdue_count: 1,
      change_cents: null,
    },
    cash_summary: {
      delivered: 5000,
      spent: 3000,
      returned: 500,
      balance_cents: 1500,
    },
  };
  for (const role of ["owner", "assistant"]) {
    const user = {
      id: 1,
      role,
      name: role === "owner" ? "Gerente" : "Asistente",
    };
    const html = m.renderToStaticMarkup(
      e(
        m.Shell,
        { user, page: "summary", onNavigate: () => {}, onLogout: () => {} },
        e(m.RoleOverview, { data, user, onSelect: () => {}, onNew: () => {} }),
      ),
    );
    for (const label of [
      "Deudas del mes",
      "Pendientes",
      "Vencidos",
      "Pagados",
      "Control de efectivo",
      "Préstamos",
    ])
      assert.ok(html.includes(label));
    for (const label of [
      "Izipay",
      "Recargar saldo",
      "Pagar en prueba",
      "Cuenta de prueba",
      "Propietario",
    ])
      assert.ok(!html.includes(label), label);
    assert.equal(html.includes("Registrar recibo"), role === "assistant");
    const loans = m.renderToStaticMarkup(
      e(m.Loans, {
        suppliers: [],
        user,
        version: data,
        onChanged: () => {},
        onSelect: () => {},
      }),
    );
    assert.equal(loans.includes("Registrar préstamo"), role === "assistant");
    assert.ok(loans.includes("el gerente supervisa"));
    if (role === "owner") {
      assert.ok(html.includes("Gastos pagados en el mes"));
      assert.ok(html.includes("1,250.75"));
    }
  }
  const form = m.renderToStaticMarkup(
    e(m.BillForm, {
      suppliers: [],
      month: "2026-10",
      onClose: () => {},
      onSaved: () => {},
    }),
  );
  assert.ok(form.includes("Número de recibo"));
  assert.ok(form.includes("Formato del número de recibo"));
  assert.ok(!form.includes("Préstamos"));
  const amount = m.renderToStaticMarkup(
    e(m.MoneyInput, { name: "amount", cents: 14550 }),
  );
  assert.ok(amount.includes('value="145.50"'));
  assert.ok(amount.includes('inputMode="decimal"'));
});
