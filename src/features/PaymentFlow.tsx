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
    [funding, setFunding] = useState<"manager_funds" | "other_funds">(
      user.role === "assistant" ? "manager_funds" : "other_funds",
    ),
    [cash, setCash] = useState<CashData | null>(null),
    [holder, setHolder] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useModalLock(busy);
  useEffect(() => {
    if (funding !== "manager_funds") return;
    let live = true;
    setCash(null);
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
  }, [funding]);
  const available =
    user.role === "assistant"
      ? cash?.balance_cents
      : cash?.people.find((p) => p.id === Number(holder))?.balance_cents;
  const insufficient =
    funding === "manager_funds" &&
    (available == null || available < (bill.remaining_cents || 0));
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
              funding_source: funding,
              payment_date: f.get("payment_date"),
              operation: f.get("operation"),
              receipt,
              cash_holder_id:
                funding === "manager_funds"
                  ? user.role === "assistant"
                    ? user.id
                    : holder
                      ? Number(holder)
                      : null
                  : undefined,
            });
            onChanged();
            notify(
              funding === "manager_funds"
                ? `Pago registrado. Se descontaron ${money(bill.remaining_cents)} del fondo del asistente.`
                : "Pago registrado con otros fondos. No se descontó del fondo entregado.",
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
            disabled={busy}
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
        <Field
          label="Origen del dinero"
          hint="Elige el fondo utilizado, independientemente de si pagaste en efectivo, por transferencia o billetera."
        >
          <select
            value={funding}
            disabled={busy}
            onChange={(e) => {
              setFunding(e.target.value as "manager_funds" | "other_funds");
              setError("");
            }}
          >
            <option value="manager_funds">
              Dinero entregado por el gerente
            </option>
            <option value="other_funds">
              Otros fondos · sin cargo al fondo del asistente
            </option>
          </select>
        </Field>
        {funding === "manager_funds" ? (
          <div className="notice">
            {user.role === "assistant" ? (
              <p>
                Fondo disponible:{" "}
                <strong>
                  {cash ? money(cash.balance_cents) : "Cargando…"}
                </strong>
                {insufficient
                  ? ". El fondo entregado no alcanza para este pago."
                  : ""}
              </p>
            ) : (
              <Field label="Asistente cuyo fondo se utilizó">
                <select
                  value={holder}
                  disabled={busy}
                  onChange={(e) => setHolder(e.target.value)}
                >
                  <option value="">Selecciona al asistente</option>
                  {cash?.people.map((p) => (
                    <option key={p.id} value={p.id}>
                      A cargo de {p.name} · {money(p.balance_cents)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <small>
              Se descontará {money(bill.remaining_cents)} al guardar la
              constancia.
              {available != null && !insufficient
                ? ` Quedarán ${money(available - (bill.remaining_cents || 0))} por rendir.`
                : ""}
              {user.role === "owner" && insufficient
                ? " Selecciona un fondo con saldo suficiente."
                : ""}
            </small>
          </div>
        ) : (
          <p className="info-text">
            Este pago aparecerá en Control de efectivo con cargo S/ 0.00 al
            fondo del asistente.
          </p>
        )}
        <Field
          label="Número de operación o constancia"
          hint="El código de pago debe ser único, incluso si cambia el medio de pago."
        >
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
