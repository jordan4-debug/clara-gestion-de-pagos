import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { createRequire } from "node:module";
import { calculateSchedule } from "../server/loan-schedule.mjs";
import { seedState } from "../server/cloud-state.mjs";
test("Rendered manager and assistant screens expose only administrative actions and independent filters", async () => {
  const { outputFiles } = buildSync({
    stdin: {
      contents: `import React from 'react'; import { renderToStaticMarkup } from 'react-dom/server'; import {RoleOverview} from './src/features/RoleOverview'; import {Shell} from './src/components/Shell'; import {BillForm} from './src/features/EntityForms'; import {MoneyInput} from './src/components/MoneyInput'; import {Loans,LoanForm,ScheduleTable} from './src/features/Loans'; import {Login} from './src/features/Access'; import {EntitySelector} from './src/components/EntitySelector'; import {SupplierForm} from './src/features/EntityForms'; import {SettingsView} from './src/features/SettingsView'; export {React,renderToStaticMarkup,RoleOverview,Shell,BillForm,MoneyInput,Loans,Login,EntitySelector,SupplierForm,SettingsView,LoanForm,ScheduleTable};`,
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
  const base = {
    supplier: "Entidad",
    category: "Servicios",
    supplier_id: 1,
    paid_cents: 0,
    amount_cents: 10000,
    remaining_cents: 10000,
    month: "2026-10",
    due_date: "2026-10-30",
  };
  const bills = [
    { ...base, id: 1, title: "DEUDA-VIGENTE", status: "Pendiente" },
    {
      ...base,
      id: 2,
      title: "DEUDA-VENCIDA",
      due_date: "2026-10-01",
      status: "Vencido",
    },
    {
      ...base,
      id: 3,
      title: "RECIBO-CANCELADO",
      status: "Pagado",
      paid_cents: 10000,
      remaining_cents: 0,
    },
  ];
  const data = {
    bills,
    all_bills: [
      ...bills,
      {
        ...base,
        id: 4,
        title: "DEUDA-FUTURA",
        month: "2026-11",
        due_date: "2026-11-30",
        status: "Pendiente",
      },
    ],
    month: "2026-10",
    totals: { total: 0, monthPaid: 0, undefined: 0 },
    variation_summary: {
      variation_enabled: true,
      variation_percent: 20,
      variation_min_cents: 1000,
      total: 2,
      compared: 1,
      alerts: [
        {
          bill_id: 1,
          title: "LUZ CON AUMENTO",
          supplier: "Hidrandina",
          month: "2026-10",
          service_reference: "SUM-001",
          current_cents: 15000,
          previous_cents: 10000,
          previous_month: "2026-09",
          previous_bill_id: 9,
          previous_receipt_id: 10,
          current_receipt_id: 11,
          difference_cents: 5000,
          percent: 50,
          status: "compared",
          alert: true,
        },
      ],
      unavailable: [
        {
          bill_id: 2,
          title: "Sin referencia",
          supplier: "Sedalib",
          status: "missing_reference",
        },
      ],
    },
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
    assert.equal((html.match(/role="tab"/g) || []).length, 3);
    assert.ok(!html.includes(">Todos<"));
    assert.deepEqual(
      [...html.matchAll(/<button[^>]*role="tab"[^>]*>([^<]+)/g)].map(
        (x) => x[1],
      ),
      ["Deudas del mes", "Vencidos", "Pagados"],
    );
    assert.ok(html.includes("Resumen PDF"));
    assert.ok(html.includes("Incluir deudas de los próximos meses"));
    assert.ok(html.includes("DEUDA-VIGENTE"));
    assert.ok(html.includes("DEUDA-VENCIDA"));
    assert.ok(!html.includes("RECIBO-CANCELADO"));
    assert.ok(!html.includes("DEUDA-FUTURA"));
    assert.ok(
      html.indexOf('class="role-metrics monthly-metrics"') <
        html.indexOf('class="panel payments-panel"'),
    );
    const overview = m.renderToStaticMarkup(
      e(m.RoleOverview, { data, user, onSelect: () => {}, onNew: () => {} }),
    );
    assert.ok(
      overview.startsWith('<div class="role-metrics monthly-metrics">'),
    );
    assert.equal(html.includes("Registrar recibo"), role === "assistant");
    assert.equal(html.includes("Alertas de variación"), role === "owner");
    if (role === "owner") {
      assert.ok(html.includes("50 %"));
      assert.ok(html.includes('href="/api/receipts/10"'));
      assert.ok(html.includes('href="/api/receipts/11"'));
      assert.ok(html.includes("Falta el código de suministro o contrato."));
      assert.ok(
        html.indexOf('class="role-metrics monthly-metrics"') <
          html.indexOf('class="panel variation-panel"'),
      );
    }
    const settings = m.renderToStaticMarkup(
      e(m.SettingsView, {
        user,
        settings: {
          reminder_days: 3,
          recipient: "both",
          variation_enabled: true,
          variation_percent: 20,
          variation_min_cents: 1000,
        },
        onChanged: () => {},
        notify: () => {},
      }),
    );
    assert.equal(
      settings.includes('name="variation_percent"'),
      role === "owner",
    );
    assert.equal(settings.includes('name="variation_min"'), role === "owner");
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
      assert.ok(html.includes("Pagos realizados en el mes"));
      assert.ok(html.includes("1,250.75"));
    }
  }
  const login = m.renderToStaticMarkup(e(m.Login, { onLogin: () => {} }));
  assert.ok(login.includes("Iniciar sesión"));
  assert.ok(!login.includes("Como gerente"));
  assert.ok(!login.includes("Como asistente"));
  assert.ok(!login.includes("explorar el sistema"));
  const form = m.renderToStaticMarkup(
    e(m.BillForm, {
      suppliers: [],
      month: "2026-10",
      onClose: () => {},
      onSaved: () => {},
    }),
  );
  assert.ok(form.includes("Agregar proveedor o entidad"));
  assert.ok(form.includes("Número de recibo"));
  assert.ok(!form.includes("Formato del número de recibo"));
  assert.ok(!form.includes("Letras y números"));
  assert.ok(form.includes('type="hidden" name="receipt_format"'));
  const categoryField = form.match(/<input\b[^>]*name="category"[^>]*>/)?.[0];
  assert.ok(categoryField?.includes('readOnly=""'));
  assert.ok(categoryField?.includes('value=""'));
  assert.ok(!/<select[^>]*name="category"/.test(form));
  assert.ok(
    form.includes("Se asigna automáticamente según el proveedor o entidad."),
  );
  const suppliers = seedState().suppliers;
  const selector = m.renderToStaticMarkup(e(m.EntitySelector, { suppliers }));
  for (const name of ["Hidrandina", "Sedalib", "Movistar", "SATT", "SUNAT"])
    assert.ok(selector.includes(name), name);
  assert.ok(selector.includes('<optgroup label="Servicios">'));
  const lenders = m.renderToStaticMarkup(
    e(m.EntitySelector, { suppliers, loans: true }),
  );
  assert.ok(lenders.includes("Caja Trujillo"));
  for (const name of [
    "BCP",
    "BBVA",
    "Interbank",
    "Scotiabank",
    "Mibanco",
    "Banco Pichincha",
    "Caja Piura",
    "Caja Arequipa",
    "Caja Huancayo",
  ])
    assert.ok(lenders.includes(name), name);
  assert.ok(!selector.includes(">BCP<"));
  const supplierForm = m.renderToStaticMarkup(
    e(m.SupplierForm, { onSaved: () => {}, onClose: () => {} }),
  );
  assert.ok(!supplierForm.includes("Formato habitual de recibo"));
  assert.ok(!supplierForm.includes("Letras y números"));
  assert.ok(!form.includes("Préstamos"));
  const loanForm = m.renderToStaticMarkup(
    e(m.LoanForm, { suppliers, onClose: () => {}, onSaved: () => {} }),
  );
  assert.ok(loanForm.includes("Tasa de interés total (%)"));
  assert.ok(loanForm.includes('name="disbursement_date"'));
  assert.ok(loanForm.includes('name="count"'));
  assert.equal((loanForm.match(/name="double_months"/g) || []).length, 12);
  assert.ok(loanForm.includes('min="1900-01-01"'));
  assert.ok(!loanForm.includes('name="quota"'));
  assert.ok(!loanForm.includes('name="last"'));
  assert.ok(!loanForm.includes('name="first_due_date"'));
  const sample = calculateSchedule({
    principal_cents: 3600000,
    total_interest_percent: 17.02,
    disbursement_date: "2026-03-05",
    installments: 24,
    double_months: [7, 12],
  });
  const schedule = m.renderToStaticMarkup(
    e(m.ScheduleTable, { rows: sample.schedule }),
  );
  for (const column of [
    "Saldo inicial",
    "Interés",
    "Amortización",
    "Cuota a pagar",
    "Saldo final",
    "Normal",
    "Doble",
    "Totales",
  ])
    assert.ok(schedule.includes(column), column);
  assert.ok(schedule.includes('role="region"'));
  const legacy = m.renderToStaticMarkup(
    e(m.ScheduleTable, {
      rows: [
        {
          installment_number: 1,
          due_date: "2020-01-01",
          amount_cents: 35000,
          id: 1,
          status: "Parcial",
        },
      ],
      onSelect: () => {},
    }),
  );
  assert.ok(!legacy.includes("Amortización"));
  assert.ok(legacy.includes("Parcial"));
  const historicalForm = m.renderToStaticMarkup(
    e(m.BillForm, {
      suppliers,
      month: "2025-09",
      onClose: () => {},
      onSaved: () => {},
    }),
  );
  assert.ok(historicalForm.includes('value="2025-09-01"'));
  assert.ok(historicalForm.includes('min="1900-01-01"'));
  const amount = m.renderToStaticMarkup(
    e(m.MoneyInput, { name: "amount", cents: 14550 }),
  );
  assert.ok(amount.includes('value="145.50"'));
  assert.ok(amount.includes('inputMode="decimal"'));
  assert.ok(amount.includes('data-money-input="true"'));
  assert.ok(amount.includes('pattern="[0-9]+(?:\\.[0-9]{1,2})?"'));
  assert.ok(
    amount.includes('title="Solo números y punto decimal. Ejemplo: 100.00"'),
  );
});
