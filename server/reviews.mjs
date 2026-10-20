import { activeExpense } from "./expenses.mjs";
import { z } from "zod";
import { addAudit, decorate } from "./cloud-state.mjs";

const fail = (message, status = 409) => {
  throw Object.assign(new Error(message), { status });
};
export const reviewInput = z
  .object({
    status: z.enum(["verified", "observed"]),
    note: z.string().trim().max(1000).default(""),
    revision: z.number().int().nonnegative(),
  })
  .refine(
    (x) => x.status !== "observed" || x.note.length >= 5,
    "Explica qué debe corregirse (mínimo 5 caracteres).",
  );
export const reviewStatus = (p) => p.review_status || "pending";
export function findPayment(state, id) {
  const payment = state.payments.find((p) => p.id === id);
  if (!payment) fail("Abono no encontrado.", 404);
  if (
    payment.kind === "simulated" ||
    !activeExpense(
      state,
      state.bills.find((b) => b.id === payment.bill_id) || {},
    )
  )
    fail("Este registro histórico está archivado.", 410);
  return payment;
}
export function checkRevision(payment, revision) {
  if ((payment.review_revision || 0) !== revision)
    fail(
      "El comprobante cambió mientras lo revisabas. Actualiza y vuelve a revisarlo.",
    );
}
export function reviewPayment(state, id, input, user) {
  if (user.role !== "owner")
    fail("Solo el propietario puede revisar comprobantes.", 403);
  const p = findPayment(state, id);
  checkRevision(p, input.revision);
  if (reviewStatus(p) !== "pending") fail("Este comprobante ya fue revisado.");
  if (!p.receipt_id && input.status === "verified")
    fail("Este abono no tiene un comprobante para revisar.");
  const event = {
    status: input.status,
    note: input.note,
    actor: user.name,
    actor_id: user.id,
    receipt_id: p.receipt_id || null,
    created_at: new Date().toISOString(),
  };
  Object.assign(p, {
    review_status: input.status,
    review_note: input.note,
    reviewed_by: user.name,
    reviewed_at: event.created_at,
    review_revision: (p.review_revision || 0) + 1,
  });
  (p.review_events ||= []).push(event);
  addAudit(
    state,
    user.name,
    input.status === "verified"
      ? "Comprobante revisado"
      : "Comprobante observado",
    `Abono #${p.id} · ${state.bills.find((b) => b.id === p.bill_id)?.title} · ${input.note || "Constancia conforme"}`,
  );
}
export function assertCorrection(payment, revision, user) {
  checkRevision(payment, revision);
  if (reviewStatus(payment) !== "observed")
    fail("Solo se corrigen comprobantes observados.");
  if (user.role !== "owner" && payment.actor_id && payment.actor_id !== user.id)
    fail(
      "Solo quien registró el abono o el propietario puede corregirlo.",
      403,
    );
}
export function reviewQueue(state, selected) {
  return state.payments
    .filter(
      (p) =>
        p.kind !== "simulated" &&
        activeExpense(state, state.bills.find((b) => b.id === p.bill_id) || {}),
    )
    .filter((p) =>
      state.bills.some((b) => b.id === p.bill_id && b.month === selected),
    )
    .map((p) => {
      const b = decorate(
        state,
        state.bills.find((b) => b.id === p.bill_id),
      );
      return {
        ...p,
        destination: p.destination
          ? {
              supplier: p.destination.supplier,
              reference: p.destination.reference,
            }
          : undefined,
        review_status: reviewStatus(p),
        review_revision: p.review_revision || 0,
        title: b.title,
        supplier: b.supplier,
        month: b.month,
      };
    })
    .sort((a, b) => b.id - a.id);
}
