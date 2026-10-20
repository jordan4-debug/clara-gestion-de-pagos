import { financeView } from "./finance.mjs";
import { today, monthDate, status, remaining } from "./domain.mjs";
import { providerPayment } from "./provider-payments.mjs";

export function seedState() {
  const selected = today().slice(0, 7);
  const suppliers = [
    [
      "Hidrandina",
      "Servicios",
      "https://servicios.distriluz.com.pe/OficinaVirtual/",
    ],
    ["Sedalib", "Servicios", "https://oficinavirtual.sedalib.com.pe/login"],
    ["Movistar", "Servicios", "https://www.movistar.com.pe/"],
    ["SATT", "Impuestos", "https://digital.satt.gob.pe/pagos/"],
    ["SUNAT", "Impuestos", "https://www.sunat.gob.pe/"],
    ["Inmobiliaria Los Pinos · Trujillo (ficticia)", "Alquiler", ""],
    ["Caja Trujillo", "Préstamos", "https://www.cajatrujillo.com.pe/"],
  ].map(([name, category, portal], i) => ({
    id: i + 1,
    name,
    category,
    portal,
    bank: "",
    account: "",
    reference: "Ejemplo ficticio · no usar para transferencias",
    channel: "external",
    payment_gateway: category === "Préstamos" || !portal ? "manual" : "portal",
    payment_url: category === "Préstamos" ? "" : portal,
    payment_methods:
      category === "Préstamos"
        ? ["Transferencia", "Ventanilla", "Otro"]
        : portal
          ? ["Portal de entidad", "Transferencia", "Ventanilla", "Otro"]
          : ["Transferencia", "Yape", "Plin", "Ventanilla", "Otro"],
  }));
  const definitions = [
    ["Luz", 1, null, 20],
    ["Agua", 2, null, 22],
    ["Internet", 3, 15000, 25],
    ["Impuesto predial", 4, 62000, 28],
    ["Declaración mensual", 5, null, 30],
    ["Alquiler oficina", 6, 180000, 5],
  ];
  const templates = definitions.map(
    ([title, supplier_id, amount_cents, day], i) => ({
      id: i + 1,
      title,
      supplier_id,
      amount_cents,
      day,
      active: 1,
    }),
  );
  const bills = templates.map((t) => ({
    id: t.id,
    title: t.title,
    supplier_id: t.supplier_id,
    amount_cents:
      t.id === 1
        ? 32000
        : t.id === 2
          ? 18000
          : t.id === 3
            ? null
            : t.amount_cents,
    paid_cents: 0,
    due_date: monthDate(selected, t.day),
    month: selected,
    template_id: t.id,
    approval: "approved",
    notes: "Dato ficticio para la demostración compartida.",
  }));
  return {
    suppliers,
    loans: [],
    cash_movements: [],
    finance_periods: {},
    templates,
    bills,
    payments: [],
    receipts: [],
    activity: [
      {
        id: 1,
        actor: "Sistema",
        action: "Espacio compartido preparado",
        detail: "Datos ficticios. Ningún pago real se ha realizado.",
        created_at: new Date().toISOString(),
      },
    ],
    settings: { reminder_days: 3, recipient: "both" },
    next: {
      suppliers: 8,
      loans: 1,
      cash: 1,
      templates: 7,
      bills: 7,
      payments: 1,
      receipts: 1,
      activity: 2,
    },
  };
}

export async function readState(db) {
  let row = await db
    .prepare("SELECT revision,payload FROM shared_state WHERE id=1")
    .first();
  if (!row) {
    await db
      .prepare(
        "INSERT OR IGNORE INTO shared_state(id,revision,payload) VALUES(1,0,?)",
      )
      .bind(JSON.stringify(seedState()))
      .run();
    row = await db
      .prepare("SELECT revision,payload FROM shared_state WHERE id=1")
      .first();
  }
  return { revision: row.revision, state: JSON.parse(row.payload) };
}

// D1 conditional writes prevent one visitor from overwriting another visitor's changes.
// Retried mutators are synchronous and must not perform external side effects.
export async function mutateState(db, mutate) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const { revision, state } = await readState(db);
    const result = mutate(state);
    const payload = JSON.stringify(state);
    if (new TextEncoder().encode(payload).length > 512000)
      throw Object.assign(
        new Error(
          "La demo alcanzó su capacidad. Comunícate con el responsable del proyecto.",
        ),
        { status: 409 },
      );
    const saved = await db
      .prepare(
        "UPDATE shared_state SET payload=?,revision=revision+1 WHERE id=1 AND revision=?",
      )
      .bind(payload, revision)
      .run();
    if (saved.meta.changes === 1) return result;
  }
  throw Object.assign(
    new Error("Otro participante está guardando cambios. Vuelve a intentarlo."),
    {
      status: 409,
    },
  );
}

export function decorate(state, bill) {
  const supplier = state.suppliers.find((s) => s.id === bill.supplier_id);
  return {
    ...supplier,
    ...bill,
    supplier: supplier.name,
    provider_payment: providerPayment(supplier),
    approval: "approved",
    status: status(bill),
    simulated: state.payments.some(
      (p) => p.bill_id === bill.id && p.kind === "simulated",
    ),
    remaining_cents: remaining(bill),
    due_soon:
      status(bill) !== "Pagado" &&
      bill.due_date >= today() &&
      bill.due_date <=
        new Date(Date.parse(today() + "T12:00:00Z") + 3 * 86400000)
          .toISOString()
          .slice(0, 10),
    pending_attempt: null,
    pending_reviews: state.payments.filter(
      (p) =>
        p.bill_id === bill.id &&
        (!p.review_status || p.review_status === "pending"),
    ).length,
    observed_reviews: state.payments.filter(
      (p) => p.bill_id === bill.id && p.review_status === "observed",
    ).length,
  };
}

export function addAudit(state, actor, action, detail) {
  state.activity.unshift({
    id: state.next.activity++,
    actor,
    action,
    detail,
    created_at: new Date().toISOString(),
  });
  state.activity = state.activity.slice(0, 500);
}

export function dashboard(state, selected, role) {
  const date = today();
  const dateAfter = (days) =>
    new Date(Date.parse(date + "T12:00:00Z") + days * 86400000)
      .toISOString()
      .slice(0, 10);
  const all = state.bills
    .map((b) => decorate(state, b))
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id - b.id);
  const bills = all.filter((b) => b.month === selected);
  const week = all.filter(
    (b) => b.due_date >= date && b.due_date <= dateAfter(6),
  );
  const visible =
    state.settings.recipient === "both" || state.settings.recipient === role;
  return {
    today: date,
    month: selected,
    finance: financeView(state, selected),
    bills,
    settings: state.settings,
    totals: {
      total: bills.reduce((n, b) => n + (b.amount_cents || 0), 0),
      monthPaid: bills.reduce((n, b) => n + b.paid_cents, 0),
      pending: bills.reduce((s, b) => s + (b.remaining_cents || 0), 0),
      week: week.reduce((s, b) => s + (b.remaining_cents || 0), 0),
      paid: state.payments
        .filter(
          (p) =>
            new Intl.DateTimeFormat("en-CA", {
              timeZone: "America/Lima",
              year: "numeric",
              month: "2-digit",
            })
              .format(new Date(p.created_at))
              .slice(0, 7) === selected,
        )
        .reduce((s, p) => s + p.amount_cents, 0),
      undefined: bills.filter((b) => b.amount_cents === null).length,
      weekUndefined: week.filter((b) => b.amount_cents === null).length,
    },
    upcoming: all.filter((b) => b.status !== "Pagado").slice(0, 4),
    notifications: visible
      ? all.filter(
          (b) =>
            b.status !== "Pagado" &&
            b.due_date <= dateAfter(state.settings.reminder_days),
        )
      : [],
    activity: state.activity.slice(0, 8),
  };
}
