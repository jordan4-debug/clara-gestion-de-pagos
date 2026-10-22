import { receiptError } from "../shared/expenses.mjs";
// Loan installments are obligations too; they share receipts, payments and totals.
export const activeExpense = (state, bill) =>
  Boolean(bill?.id) &&
  !bill.archived_at &&
  !(
    bill.loan_id &&
    state.loans?.some((l) => l.id === bill.loan_id && l.archived_at)
  );
export function assertEditable(bill, user) {
  if (user.role !== "assistant")
    throw Object.assign(
      new Error("Solo el asistente registra y modifica recibos."),
      { status: 403 },
    );
  if (bill.created_by_id && bill.created_by_id !== user.id)
    throw Object.assign(
      new Error(
        "Solo puedes modificar los recibos que registraste. Puedes consultar los demás.",
      ),
      { status: 403 },
    );
}
export function assertReceipt(state, bill, number, format = "alphanumeric") {
  const error = receiptError(number, format);
  if (error) throw Object.assign(new Error(error), { status: 400 });
  if (
    state.bills.some(
      (b) =>
        b.id !== bill.id &&
        b.invoice_number?.toUpperCase() === number.toUpperCase(),
    )
  )
    throw Object.assign(
      new Error(
        "Este número de recibo ya está registrado. No se puede guardar otro comprobante con el mismo número.",
      ),
      { status: 409 },
    );
}
export function assertPaymentOperation(state, operation) {
  const normalized = operation.trim().toUpperCase();
  if (
    state.payments.some(
      (payment) => payment.operation?.trim().toUpperCase() === normalized,
    )
  )
    throw Object.assign(
      new Error(
        "Este código de pago o número de operación ya está registrado. No se puede guardar otro comprobante con el mismo código.",
      ),
      { status: 409 },
    );
}
export function assertOriginal(state, bill) {
  if (
    !bill.invoice_receipt_id ||
    !bill.invoice_number ||
    !state.receipts.some((r) => r.id === bill.invoice_receipt_id)
  )
    throw Object.assign(
      new Error(
        "Adjunta el recibo original y su número antes de registrar el pago.",
      ),
      { status: 409 },
    );
}
export function publicSupplier(s) {
  return {
    id: s.id,
    name: s.name,
    category: s.category,
    reference: s.reference || "",
    receipt_format: s.receipt_format || "alphanumeric",
  };
}
export const recordedPayment = (state, p) =>
  p.kind !== "simulated" &&
  activeExpense(state, state.bills.find((b) => b.id === p.bill_id) || {});
export const recordMonth = (p) =>
  p.payment_date?.slice(0, 7) ||
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date(p.created_at))
    .slice(0, 7);
