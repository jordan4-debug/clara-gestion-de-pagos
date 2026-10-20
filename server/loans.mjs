import { z } from "zod";
import { cents, date } from "./validation.mjs";
import { today, monthDate, remaining, status } from "./domain.mjs";
import { addAudit, decorate } from "./cloud-state.mjs";
export const loanInput = z.object({
  title: z.string().trim().min(3).max(120),
  supplier_id: z.number().int().positive(),
  principal_cents: cents,
  installment_cents: cents,
  last_installment_cents: cents.optional(),
  installments: z.number().int().min(1).max(120),
  first_due_date: date,
  reference: z.string().trim().max(120).default(""),
  notes: z.string().trim().max(2000).default(""),
});
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
export function createLoan(state, input, user) {
  const supplier = state.suppliers.find((s) => s.id === input.supplier_id);
  if (!supplier || supplier.category !== "Préstamos")
    fail("Selecciona una entidad de la categoría Préstamos.");
  if (input.first_due_date < today())
    fail("La primera cuota pendiente no puede vencer antes de hoy.");
  const last = input.last_installment_cents ?? input.installment_cents;
  const total = input.installment_cents * (input.installments - 1) + last;
  if (
    input.reference &&
    (state.loans || []).some(
      (l) =>
        l.supplier_id === input.supplier_id &&
        l.reference?.toUpperCase() === input.reference.toUpperCase(),
    )
  )
    fail("Este contrato de préstamo ya está registrado.", 409);
  if (
    state.bills.length + input.installments > 300 ||
    (state.loans || []).length >= 30
  )
    fail("No hay capacidad para todas las cuotas del préstamo.", 409);
  state.loans ||= [];
  state.next.loans = Math.max(
    state.next.loans || 1,
    ...state.loans.map((l) => l.id + 1),
  );
  const id = state.next.loans++;
  const loan = {
    id,
    ...input,
    last_installment_cents: last,
    total_cents: total,
    created_at: new Date().toISOString(),
    actor: user.name,
    actor_id: user.id,
  };
  state.loans.push(loan);
  const first = new Date(input.first_due_date + "T12:00:00Z"),
    day = Number(input.first_due_date.slice(8));
  for (let i = 0; i < input.installments; i++) {
    const month = new Date(
      Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + i, 1),
    )
      .toISOString()
      .slice(0, 7);
    state.bills.push({
      id: state.next.bills++,
      title: `${input.title} · Cuota ${i + 1}/${input.installments}`,
      supplier_id: input.supplier_id,
      amount_cents:
        i === input.installments - 1 ? last : input.installment_cents,
      paid_cents: 0,
      category: "Préstamos",
      created_by: user.name,
      created_by_id: user.id,
      created_at: loan.created_at,
      due_date: monthDate(month, day),
      month,
      template_id: null,
      approval: "approved",
      loan_id: id,
      installment_number: i + 1,
      service_reference: input.reference,
      notes: input.notes,
    });
  }
  addAudit(
    state,
    user.name,
    "Préstamo registrado",
    `${loan.title} · ${input.installments} cuotas · ${supplier.name}`,
  );
  return { id };
}
export function listLoans(state) {
  return (state.loans || []).map((loan) => {
    const installments = state.bills
      .filter((b) => b.loan_id === loan.id)
      .sort((a, b) => a.installment_number - b.installment_number);
    const pending = installments.filter((b) => remaining(b) > 0);
    return {
      ...loan,
      supplier: state.suppliers.find((s) => s.id === loan.supplier_id)?.name,
      installments: installments.map((b) => decorate(state, b)),
      installment_count: loan.installments,
      paid_cents: installments.reduce((n, b) => n + b.paid_cents, 0),
      remaining_cents: pending.reduce((n, b) => n + remaining(b), 0),
      paid_installments: installments.length - pending.length,
      overdue_installments: installments.filter((b) => status(b) === "Vencido")
        .length,
      next_due_date:
        [...pending].sort((a, b) => a.due_date.localeCompare(b.due_date))[0]
          ?.due_date || null,
    };
  });
}
