import { z } from "zod";
import { remaining, status, today } from "./domain.mjs";
import { date } from "./validation.mjs";
import { scheduleInput, calculateSchedule } from "./loan-schedule.mjs";
import { addAudit, decorate } from "./cloud-state.mjs";
export const loanInput = scheduleInput.extend({
  title: z.string().trim().min(3).max(120),
  supplier_id: z.number().int().positive(),
  disbursement_date: date.optional(),
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
  if (input.disbursement_date && input.disbursement_date > today())
    fail("La fecha de desembolso no puede estar en el futuro.");
  if (
    input.disbursement_date &&
    input.disbursement_date > input.first_due_date
  )
    fail("La fecha de desembolso no puede ser posterior al primer vencimiento.");
  const {
    title,
    supplier_id,
    reference,
    notes,
    disbursement_date,
    ...parameters
  } = input;
  const calculated = calculateSchedule(parameters);
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
    calculation_method: calculated.calculation_method,
    annual_interest_percent: calculated.annual_interest_percent,
    rate_convention: calculated.rate_convention,
    monthly_rate: calculated.monthly_rate,
    interest_total_cents: calculated.interest_total_cents,
    installment_cents: calculated.base_installment_cents,
    last_installment_cents: calculated.schedule.at(-1).amount_cents,
    first_due_date: calculated.schedule[0].due_date,
    total_cents: calculated.total_cents,
    created_at: new Date().toISOString(),
    actor: user.name,
    actor_id: user.id,
  };
  state.loans.push(loan);
  for (const row of calculated.schedule) {
    state.bills.push({
      id: state.next.bills++,
      title: `${input.title} · Cuota ${row.installment_number}/${input.installments}`,
      supplier_id: input.supplier_id,
      ...row,
      paid_cents: 0,
      category: "Préstamos",
      created_by: user.name,
      created_by_id: user.id,
      created_at: loan.created_at,
      month: row.due_date.slice(0, 7),
      template_id: null,
      approval: "approved",
      loan_id: id,
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
  return (state.loans || [])
    .filter((l) => !l.archived_at)
    .map((loan) => {
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
        overdue_installments: installments.filter(
          (b) => status(b) === "Vencido",
        ).length,
        next_due_date:
          [...pending].sort((a, b) => a.due_date.localeCompare(b.due_date))[0]
            ?.due_date || null,
      };
    });
}

export function archiveLoan(state, id, user, restore = false) {
  if (user.role !== "owner")
    fail("Solo el gerente puede retirar o recuperar un préstamo.", 403);
  const loan = state.loans?.find((l) => l.id === id);
  if (!loan) fail("Préstamo no encontrado.", 404);
  const bills = state.bills.filter((b) => b.loan_id === id);
  if (
    !restore &&
    (bills.some((b) => b.paid_cents > 0) ||
      state.payments.some((p) => bills.some((b) => b.id === p.bill_id)))
  )
    fail(
      "No se retira un préstamo con pagos registrados. Conserva su historial.",
      409,
    );
  if (restore ? !loan.archived_at : !!loan.archived_at) return { ok: true };
  const date = new Date().toISOString();
  for (const record of [loan, ...bills]) {
    if (restore) {
      delete record.archived_at;
      delete record.archived_by_id;
    } else {
      record.archived_at = date;
      record.archived_by_id = user.id;
    }
  }
  addAudit(
    state,
    user.name,
    restore ? "Préstamo recuperado" : "Préstamo retirado",
    `${loan.title} · ${bills.length} cuotas`,
  );
  return { ok: true };
}
