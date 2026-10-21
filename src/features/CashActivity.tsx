import type { CashPaymentActivity } from "../types";
import { dateTime, money } from "../lib/api";

export function CashActivity({
  entries,
  onSelect,
}: {
  entries: CashPaymentActivity[];
  onSelect?: (id: number) => void;
}) {
  return (
    <section className="panel workflow-panel">
      <h2>Pagos realizados y uso del fondo</h2>
      <p className="muted">
        Historial del mes por fecha de pago. Incluye pagos con el fondo y con
        otros recursos.
      </p>
      <div
        className="cash-payment-activity"
        role="log"
        aria-label="Actividad de pagos y gastos"
        aria-live="polite"
        aria-relevant="additions"
      >
        {!entries.length ? (
          <p className="muted">Todavía no hay pagos registrados en este mes.</p>
        ) : null}
        {entries.map((p) => (
          <article className="cash-payment-event" key={p.id}>
            <p>
              <strong>{p.actor}</strong> pagó{" "}
              <strong>{money(p.amount_cents)}</strong> por{" "}
              <strong>{p.title}</strong>
              {p.supplier ? ` · ${p.supplier}` : ""}.
            </p>
            <small>
              {p.method} · Pago: {p.payment_date.split("-").reverse().join("/")}{" "}
              · Registrado: {dateTime(p.created_at)}
            </small>
            <p className="cash-source">
              {p.funding_source === "manager_funds" ? (
                <>
                  Gastado del fondo{p.holder ? ` de ${p.holder}` : ""}:{" "}
                  <strong>{money(p.fund_spent_cents)}</strong>.
                  {p.balance_after_cents != null ? (
                    <>
                      {" "}
                      Saldo por rendir al registrar el pago:{" "}
                      <strong>{money(p.balance_after_cents)}</strong>.
                    </>
                  ) : null}
                </>
              ) : p.funding_source === "other_funds" ? (
                <>
                  Pagado con otros fondos. Cargo al fondo del asistente:{" "}
                  <strong>{money(0)}</strong>.
                </>
              ) : (
                <>
                  Origen sin indicar en el registro anterior. No hay cargo
                  registrado al fondo; se conserva el movimiento original.
                </>
              )}
            </p>
            {!p.reconciled ? (
              <p className="form-error" role="alert">
                Este pago necesita revisar su vinculación con el fondo.
              </p>
            ) : null}
            <div className="button-row">
              {onSelect ? (
                <button
                  className="button"
                  type="button"
                  onClick={() => onSelect(p.bill_id)}
                >
                  Ver pago y recibo
                </button>
              ) : null}
              {p.receipt_id ? (
                <a
                  className="button"
                  href={`/api/receipts/${p.receipt_id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Ver constancia
                </a>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
