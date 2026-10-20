import { z } from "zod";
import { cents } from "./validation.mjs";
import { addAudit } from "./cloud-state.mjs";
export const cashInput = z.object({
  kind: z.enum(["delivery", "return"]),
  holder_id: z.number().int().positive(),
  amount_cents: cents,
  note: z.string().trim().min(5).max(500),
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
export function spendCash(state, bill, paymentId, amount, user, holderId) {
  if (user.role === "owner" && holderId == null) return; // Personal cash does not consume an assistant's funds.
  const holder = user.role === "assistant" ? user.id : holderId;
  if (user.role === "assistant" && holderId != null && holderId !== user.id)
    fail("No puedes usar efectivo de otro asistente.", 403);
  if (cashBalance(state, holder) < amount)
    fail(
      "El efectivo entregado no cubre este pago. Registra primero la entrega real.",
    );
  if ((state.cash_movements || []).length >= 500)
    fail("Se alcanzó el límite de movimientos de efectivo.");
  state.cash_movements ||= [];
  state.next.cash ||= 1;
  state.cash_movements.push({
    id: state.next.cash++,
    kind: "expense",
    holder_id: holder,
    amount_cents: amount,
    bill_id: bill.id,
    payment_id: paymentId,
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
  const movements = all.filter(
    (m) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Lima",
        year: "numeric",
        month: "2-digit",
      })
        .format(new Date(m.created_at))
        .slice(0, 7) === selected,
  );
  return {
    people: people.map((p) => ({
      ...p,
      balance_cents: cashBalance(state, p.id),
    })),
    balance_cents: people.reduce((n, p) => n + cashBalance(state, p.id), 0),
    movements: [...movements].reverse(),
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
