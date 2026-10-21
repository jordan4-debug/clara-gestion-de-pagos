import { z } from "zod";
import { cents, date } from "./validation.mjs";
import { today } from "./domain.mjs";
import { addAudit } from "./cloud-state.mjs";
import { recordMonth, recordedPayment } from "./expenses.mjs";
export const cashInput = z.object({
  kind: z.enum(["delivery", "return"]),
  holder_id: z.number().int().positive(),
  amount_cents: cents,
  note: z.string().trim().min(5).max(500),
  movement_date: date
    .refine(
      (value) => value <= today(),
      "La fecha del movimiento no puede ser futura.",
    )
    .default(() => today()),
});
const fail = (message, status = 409) => {
  throw Object.assign(new Error(message), { status });
};
export const cashBalance = (state, holder) =>
  (state.cash_movements || [])
    .filter((m) => m.holder_id === holder)
    .reduce(
      (sum, m) =>
        sum + (m.kind === "delivery" ? m.amount_cents : -m.amount_cents),
      0,
    );
export const movementDate = (movement) =>
  movement.movement_date || today(new Date(movement.created_at));
function assertTimeline(state, proposed) {
  const days = new Map();
  for (const movement of [...(state.cash_movements || []), proposed]) {
    if (movement.holder_id !== proposed.holder_id) continue;
    const day = movementDate(movement);
    days.set(
      day,
      (days.get(day) || 0) +
        (movement.kind === "delivery"
          ? movement.amount_cents
          : -movement.amount_cents),
    );
  }
  let balance = 0;
  for (const [day, amount] of [...days].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    balance += amount;
    if (balance < 0)
      fail(
        `El efectivo no alcanza al ${day}. Registra primero la entrega con su fecha real.`,
      );
  }
}
export function addCash(state, input, user) {
  if (input.kind === "delivery" && user.role !== "owner")
    fail("Solo el gerente registra entregas de efectivo.", 403);
  if (user.role !== "owner" && input.holder_id !== user.id)
    fail("Solo puedes devolver el efectivo que tienes a cargo.", 403);
  if (
    input.kind === "return" &&
    input.amount_cents > cashBalance(state, input.holder_id)
  )
    fail("La devolución supera el efectivo por rendir.");
  if ((state.cash_movements || []).length >= 500)
    fail("Se alcanzó el límite de movimientos de efectivo.");
  assertTimeline(state, input);
  state.cash_movements ||= [];
  state.next.cash ||= 1;
  state.cash_movements.push({
    id: state.next.cash++,
    ...input,
    actor: user.name,
    actor_id: user.id,
    created_at: new Date().toISOString(),
  });
  addAudit(
    state,
    user.name,
    input.kind === "delivery" ? "Efectivo entregado" : "Efectivo devuelto",
    `${input.note} · S/ ${(input.amount_cents / 100).toFixed(2)}`,
  );
}
export function spendCash(
  state,
  bill,
  paymentId,
  amount,
  user,
  holderId,
  paymentDate = today(),
  paymentMethod = "Efectivo",
) {
  if (user.role === "owner" && holderId == null) return; // Personal cash does not consume an assistant's funds.
  const holder = user.role === "assistant" ? user.id : holderId;
  if (user.role === "assistant" && holderId != null && holderId !== user.id)
    fail("No puedes usar efectivo de otro asistente.", 403);
  if (cashBalance(state, holder) < amount)
    fail(
      "El fondo entregado no cubre este pago. Registra primero la entrega real.",
    );
  if ((state.cash_movements || []).length >= 500)
    fail("Se alcanzó el límite de movimientos de efectivo.");
  assertTimeline(state, {
    holder_id: holder,
    kind: "expense",
    amount_cents: amount,
    movement_date: paymentDate,
  });
  state.cash_movements ||= [];
  state.next.cash ||= 1;
  state.cash_movements.push({
    id: state.next.cash++,
    kind: "expense",
    holder_id: holder,
    amount_cents: amount,
    bill_id: bill.id,
    payment_id: paymentId,
    payment_method: paymentMethod,
    balance_after_cents: cashBalance(state, holder) - amount,
    movement_date: paymentDate,
    note: bill.title,
    actor: user.name,
    actor_id: user.id,
    created_at: new Date().toISOString(),
  });
}
export async function cashPeople(db, user) {
  const result = await db
    .prepare(
      "SELECT id,name,active FROM accounts WHERE role='assistant' AND demo=? ORDER BY id",
    )
    .bind(user.demo ? 1 : 0)
    .all();
  return user.role === "owner"
    ? result.results
    : result.results.filter((p) => p.id === user.id);
}
export function cashView(state, selected, user, people) {
  const ids = new Set(people.map((p) => p.id));
  const all = (state.cash_movements || []).filter((m) => ids.has(m.holder_id));
  const movementMonth = (m) => movementDate(m).slice(0, 7);
  const movements = all.filter((m) => movementMonth(m) === selected);
  const signed = (m) =>
    m.kind === "delivery" ? m.amount_cents : -m.amount_cents;
  const opening = all
    .filter((m) => movementMonth(m) < selected)
    .reduce((sum, m) => sum + signed(m), 0);
  const closing = opening + movements.reduce((sum, m) => sum + signed(m), 0);
  const expenses = (state.cash_movements || []).filter(
    (m) => m.kind === "expense",
  );
  const paymentActivity = (state.payments || [])
    .filter((payment) => {
      if (!state.bills || !payment.created_at) return false;
      if (!recordedPayment(state, payment) || recordMonth(payment) !== selected)
        return false;
      const expense = expenses.find((m) => m.payment_id === payment.id);
      return (
        user.role === "owner" ||
        payment.actor_id === user.id ||
        payment.cash_holder_id === user.id ||
        expense?.holder_id === user.id ||
        (!payment.actor_id && payment.actor === user.name)
      );
    })
    .map((payment) => {
      const charges = expenses.filter((m) => m.payment_id === payment.id);
      const expense = charges[0];
      const matches =
        expense?.amount_cents === payment.amount_cents &&
        expense?.bill_id === payment.bill_id &&
        (payment.cash_holder_id == null ||
          expense?.holder_id === payment.cash_holder_id);
      const bill = (state.bills || []).find((b) => b.id === payment.bill_id);
      const source = expense
        ? "manager_funds"
        : payment.funding_source === "other_funds"
          ? "other_funds"
          : "unassigned";
      return {
        id: payment.id,
        bill_id: payment.bill_id,
        title: bill?.title || `Recibo ${payment.bill_id}`,
        supplier:
          (state.suppliers || []).find((s) => s.id === bill?.supplier_id)
            ?.name || "",
        amount_cents: payment.amount_cents,
        method: payment.method,
        actor: payment.actor,
        payment_date:
          payment.payment_date || today(new Date(payment.created_at)),
        created_at: payment.created_at,
        funding_source: source,
        fund_spent_cents: charges.reduce(
          (sum, charge) => sum + charge.amount_cents,
          0,
        ),
        holder: people.find((p) => p.id === expense?.holder_id)?.name || null,
        balance_after_cents:
          charges.length === 1 ? (expense?.balance_after_cents ?? null) : null,
        receipt_id: payment.receipt_id || null,
        reconciled:
          charges.length <= 1 &&
          (payment.funding_source === "manager_funds"
            ? !!expense && matches
            : payment.funding_source === "other_funds"
              ? !expense
              : !expense || matches),
      };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
  return {
    payment_activity: paymentActivity,
    people: people.map((p) => ({
      ...p,
      balance_cents: cashBalance(state, p.id),
    })),
    balance_cents: people.reduce((n, p) => n + cashBalance(state, p.id), 0),
    reconciliation: { opening_cents: opening, closing_cents: closing },
    movements: [...movements].sort(
      (a, b) => movementDate(b).localeCompare(movementDate(a)) || b.id - a.id,
    ),
    totals: {
      delivered: movements
        .filter((m) => m.kind === "delivery")
        .reduce((n, m) => n + m.amount_cents, 0),
      spent: movements
        .filter((m) => m.kind === "expense")
        .reduce((n, m) => n + m.amount_cents, 0),
      returned: movements
        .filter((m) => m.kind === "return")
        .reduce((n, m) => n + m.amount_cents, 0),
    },
  };
}
