import { useState, useEffect } from "react";
import {
  Field,
  FormError,
  Submit,
  formData,
  useModalLock,
} from "../components/ui";
import { api, send, money, localToday } from "../lib/api";
import { receiptPayload } from "./Reviews";
import type { Bill, User, CashData } from "../types";
export function PaymentFlow({
  bill,
  user,
  onChanged,
  notify,
}: {
  bill: Bill;
  user: User;
  onChanged: () => void;
  notify: (message: string) => void;
}) {
  const [method, setMethod] = useState("Transferencia"),
    [cash, setCash] = useState<CashData | null>(null),
    [holder, setHolder] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useModalLock(busy);
  useEffect(() => {
    if (method !== "Efectivo") return;
    let live = true;
    void api<CashData>("/cash")
      .then((data) => {
        if (live) setCash(data);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [method]);
  const insufficient =
    method === "Efectivo" &&
    user.role === "assistant" &&
    (!cash || cash.balance_cents < (bill.remaining_cents || 0));
  return (
    <section className="detail-section payment-flow">
      <h3>Registrar pago realizado</h3>
      <p className="muted">
        Esta acción actualiza el control del recibo y guarda una constancia. No
        ejecuta una transferencia ni confirma un pago con el banco.
      </p>
      <form
        className="payment-record-form"
        onSubmit={async (e) => {
          const f = formData(e);
          setBusy(true);
          setError("");
          try {
            const receipt = await receiptPayload(f.get("receipt") as File);
            await send(`/bills/${bill.id}/payments`, {
              amount_cents: bill.remaining_cents,
              method,
              payment_date: f.get("payment_date"),
              operation: f.get("operation"),
              receipt,
              cash_holder_id:
                method === "Efectivo"
                  ? user.role === "assistant"
                    ? user.id
                    : holder
                      ? Number(holder)
                      : null
                  : undefined,
            });
            onChanged();
            notify(
              "Pago registrado. Constancia pendiente de revisión administrativa.",
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <Field label="Importe a registrar">
            <input type="text" readOnly value={money(bill.remaining_cents)} />
          </Field>
          <Field label="Fecha del pago realizado">
            <input
              type="date"
              name="payment_date"
              min="1900-01-01"
              max={localToday()}
              defaultValue={localToday()}
              required
            />
          </Field>
        </div>
        <Field label="Medio utilizado">
          <select
            value={method}
            onChange={(e) => {
              setMethod(e.target.value);
              setError("");
            }}
          >
            {[
              "Transferencia",
              "Yape",
              "Plin",
              "Efectivo",
              "Ventanilla",
              "Otro",
            ].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        {method === "Efectivo" ? (
          <div className="notice">
            {user.role === "assistant" ? (
              <p>
                Efectivo a tu cargo:{" "}
                <strong>
                  {cash ? money(cash.balance_cents) : "Cargando…"}
                </strong>
                {insufficient
                  ? ". No hay efectivo entregado suficiente para este importe."
                  : ""}
              </p>
            ) : (
              <Field label="Origen del efectivo">
                <select
                  value={holder}
                  onChange={(e) => setHolder(e.target.value)}
                >
                  <option value="">Efectivo propio del gerente</option>
                  {cash?.people.map((p) => (
                    <option key={p.id} value={p.id}>
                      A cargo de {p.name} · {money(p.balance_cents)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <small>
              Solo se descuenta del efectivo a cargo si se registra este pago
              con su constancia. Una entrega no es un gasto.
            </small>
          </div>
        ) : null}
        <Field label="Número de operación o constancia">
          <input
            name="operation"
            minLength={3}
            maxLength={100}
            required
            placeholder="Identificador de la constancia del pago"
          />
        </Field>
        <Field label="Constancia del pago" hint="PDF, JPG o PNG · hasta 5 MB">
          <input
            name="receipt"
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            required
          />
        </Field>
        <label className="checkbox-line">
          <input type="checkbox" required />
          Confirmo que el pago ya fue realizado y que esta constancia
          corresponde al recibo y al importe mostrado.
        </label>
        <FormError message={error} />
        <Submit busy={busy} disabled={insufficient}>
          Guardar registro del pago
        </Submit>
      </form>
    </section>
  );
}
