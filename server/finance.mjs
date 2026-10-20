import { z } from "zod";
import { assertPayable } from "./domain.mjs";
import { addAudit } from "./cloud-state.mjs";

const fail = (message, status = 409) => {
  throw Object.assign(new Error(message), { status });
};
export const periodInput = z.object({
  initial_cents: z.number().int().min(0).max(100000000),
  account: z
    .string()
    .trim()
    .regex(
      /^DEMO-[A-Z0-9-]{3,40}$/,
      "Usa una cuenta ficticia que comience por DEMO-.",
    ),
  revision: z.number().int().nonnegative(),
});
export const simulationInput = z.object({ request_id: z.string().uuid() });
export const paymentMonth = (date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date(date))
    .slice(0, 7);
export function financeView(state, selected) {
  const period = state.finance_periods?.[selected];
  const payments = state.payments.filter(
    (p) => paymentMonth(p.created_at) === selected,
  );
  const paid = payments.reduce((n, p) => n + p.amount_cents, 0);
  const pending = state.bills
    .filter((b) => b.month === selected)
    .reduce(
      (n, b) =>
        n +
        (b.amount_cents === null
          ? 0
          : Math.max(0, b.amount_cents - b.paid_cents)),
      0,
    );
  const initial = period?.initial_cents ?? 0;
  return {
    month: selected,
    configured: !!period,
    revision: period?.revision ?? 0,
    account: period?.account ?? "DEMO-CLARA-001",
    initial_cents: initial,
    paid_cents: paid,
    simulated_cents: payments
      .filter((p) => p.kind === "simulated")
      .reduce((n, p) => n + p.amount_cents, 0),
    pending_cents: pending,
    available_cents: initial - paid,
    projected_cents: initial - paid - pending,
  };
}
export function configurePeriod(state, selected, input, user) {
  if (user.role !== "owner")
    fail("Solo el propietario configura el saldo inicial.", 403);
  const current = financeView(state, selected);
  if (input.revision !== current.revision)
    fail("El saldo inicial cambió. Actualiza antes de volver a guardar.");
  if (input.initial_cents < current.paid_cents)
    fail(
      "El saldo inicial no puede ser menor que los pagos ya registrados en este periodo.",
    );
  state.finance_periods ||= {};
  state.finance_periods[selected] = {
    initial_cents: input.initial_cents,
    account: input.account,
    revision: current.revision + 1,
  };
  addAudit(
    state,
    user.name,
    "Saldo inicial de prueba configurado",
    `${selected} · S/ ${(input.initial_cents / 100).toFixed(2)}`,
  );
  return financeView(state, selected);
}
export function assertOriginal(state, bill) {
  if (
    !bill.invoice_receipt_id ||
    !bill.invoice_number ||
    !state.receipts.some((r) => r.id === bill.invoice_receipt_id)
  )
    fail(
      "Adjunta el recibo original y su número antes de pagar esta obligación o cuota.",
    );
}
export function simulatePayment(state, id, requestId, user) {
  if (user.role !== "assistant")
    fail("Solo el asistente ejecuta pagos simulados.", 403);
  const replay = state.payments.find((p) => p.request_id === requestId);
  if (replay) {
    if (replay.bill_id !== id || replay.actor_id !== user.id)
      fail("Esta solicitud ya se utilizó para otro pago.");
    return {
      payment_id: replay.id,
      operation: replay.operation,
      replayed: true,
    };
  }
  const bill = state.bills.find((b) => b.id === id);
  assertPayable(
    bill,
    bill?.amount_cents === null ? 0 : bill?.amount_cents - bill?.paid_cents,
  );
  assertOriginal(state, bill);
  const instant = new Date();
  const selected = paymentMonth(instant),
    finance = financeView(state, selected);
  const amount = bill.amount_cents - bill.paid_cents;
  if (!finance.configured)
    fail(
      "El propietario debe configurar el saldo inicial de prueba de este mes.",
    );
  if (finance.available_cents < amount)
    fail(
      "Saldo de prueba insuficiente. No se descontó dinero ni se generó un pago.",
    );
  if (state.payments.length >= 300)
    fail("Se alcanzó el límite de pagos de esta demostración.");
  const supplier = state.suppliers.find((s) => s.id === bill.supplier_id);
  const paymentId = state.next.payments++;
  const payment = {
    id: paymentId,
    bill_id: bill.id,
    amount_cents: amount,
    method: "Transferencia simulada",
    kind: "simulated",
    request_id: requestId,
    operation: `SIM-${selected.replace("-", "")}-${String(paymentId).padStart(6, "0")}`,
    receipt_id: null,
    actor: user.name,
    actor_id: user.id,
    review_status: "simulated",
    created_at: instant.toISOString(),
    destination: {
      supplier: supplier.name,
      bank: "Banco de prueba · sin movimiento real",
      account: `DEMO-DESTINO-${supplier.id}`,
      reference: bill.service_reference || supplier.reference || "",
    },
    voucher: {
      concept: bill.title,
      origin: finance.account,
      invoice_number: bill.invoice_number,
      balance_before_cents: finance.available_cents,
      balance_after_cents: finance.available_cents - amount,
    },
  };
  // Voucher, balance (derived from payments) and debt change commit in one CAS write.
  state.payments.push(payment);
  bill.paid_cents += amount;
  addAudit(
    state,
    user.name,
    "Pago simulado registrado",
    `${payment.operation} · ${bill.title} · S/ ${(amount / 100).toFixed(2)}`,
  );
  return {
    payment_id: paymentId,
    operation: payment.operation,
    replayed: false,
  };
}
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function voucherHtml(payment) {
  const pen = (n) =>
    new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: "PEN",
    }).format(n / 100);
  const rows = [
    ["Operación", payment.operation],
    [
      "Fecha y hora · Lima",
      new Intl.DateTimeFormat("es-PE", {
        dateStyle: "medium",
        timeStyle: "medium",
        timeZone: "America/Lima",
      }).format(new Date(payment.created_at)),
    ],
    ["Concepto", payment.voucher.concept],
    ["Recibo original", payment.voucher.invoice_number],
    ["Cuenta origen de prueba", payment.voucher.origin],
    ["Destinatario", payment.destination.supplier],
    ["Cuenta destino de prueba", payment.destination.account],
    ["Referencia / código", payment.destination.reference],
    ["Importe", pen(payment.amount_cents)],
    ["Saldo anterior de prueba", pen(payment.voucher.balance_before_cents)],
    ["Saldo posterior de prueba", pen(payment.voucher.balance_after_cents)],
    ["Operador", payment.actor],
  ];
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Voucher ${escape(payment.operation)} · Clara</title><style>body{font:16px system-ui;color:#153c35;max-width:680px;margin:40px auto;padding:24px}h1{font-size:28px}aside{background:#fff3cd;padding:18px;border-radius:12px}dl{margin:28px 0}div{padding:14px 0;border-bottom:1px solid #ddd}dt{color:#63766e;font-size:14px}dd{margin:5px 0;overflow-wrap:anywhere}footer{font-size:13px;color:#63766e}</style><h1>Clara · Voucher interno</h1><aside><strong>SIMULACIÓN ACADÉMICA · SIN VALIDEZ BANCARIA</strong><p>Este documento registra una operación de prueba. No acredita una transferencia, un pago tributario ni el movimiento de dinero real.</p></aside><dl>${rows.map(([k, v]) => `<div><dt>${escape(k)}</dt><dd>${escape(v)}</dd></div>`).join("")}</dl><footer>Usa las opciones de tu navegador para imprimir o guardar como PDF.</footer></html>`;
}
