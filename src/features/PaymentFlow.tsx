import { useState, useEffect } from "react";
import {
  ExternalLink,
  Landmark,
  Smartphone,
  Upload,
  CheckCircle2,
  CreditCard,
} from "lucide-react";
import { Field, FormError, Submit, formData } from "../components/ui";
import { api, send, money } from "../lib/api";
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
  notify: (s: string) => void;
}) {
  const config = bill.provider_payment;
  const [method, setMethod] = useState(""),
    [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [cash, setCash] = useState<CashData | null>(null),
    [cashError, setCashError] = useState(""),
    [holder, setHolder] = useState("");
  useEffect(() => {
    if (method !== "Efectivo") return;
    let live = true;
    setCashError("");
    void api<CashData>("/cash")
      .then((d) => {
        if (live) setCash(d);
      })
      .catch((e) => {
        if (live) setCashError(e.message);
      });
    return () => {
      live = false;
    };
  }, [method]);
  const url = config?.url || bill.portal || "";
  const methods = config?.methods || [
    "Portal de entidad",
    "Transferencia",
    "Ventanilla",
    "Otro",
  ];
  const unavailable = config?.gateway === "izipay";
  return (
    <section className="detail-section payment-flow">
      <div className="section-head">
        <h3>Pagar a {bill.supplier}</h3>
        <span className="payment-step">1 · Elegir método</span>
      </div>
      <p className="muted">
        Importe del pago creado: <strong>{money(bill.amount_cents)}</strong>.
        Pendiente por pagar: <strong>{money(bill.remaining_cents)}</strong>.
      </p>
      <fieldset className="payment-method-cards">
        <legend>¿Cómo realizarás este pago?</legend>
        {methods.map((name) => {
          const Icon = ["Yape", "Plin"].includes(name)
            ? Smartphone
            : name === "Portal de entidad"
              ? CreditCard
              : Landmark;
          return (
            <label className={method === name ? "selected" : ""} key={name}>
              <input
                type="radio"
                name={`payment-method-${bill.id}`}
                value={name}
                checked={method === name}
                onChange={() => {
                  setMethod(name);
                  setRegister(false);
                  setError("");
                }}
              />
              <Icon size={20} />
              <span>{name}</span>
              {method === name ? <CheckCircle2 size={16} /> : null}
            </label>
          );
        })}
      </fieldset>
      {method ? (
        <div className="selected-payment-method">
          <span className="payment-step">2 · Realizar el pago</span>
          {unavailable && method !== "Efectivo" ? (
            <div className="notice">
              <strong>Izipay pendiente de activación</strong>
              <p>
                El QR y el formulario de cobro de esta entidad aparecerán aquí
                cuando se configuren sus credenciales de pasarela.
              </p>
            </div>
          ) : method === "Efectivo" ? (
            <div>
              <p>
                Paga en efectivo y conserva la constancia de quien recibió el
                dinero.
              </p>
              <FormError message={cashError} />
              {user.role === "owner" ? (
                <Field label="Origen del efectivo">
                  <select
                    value={holder}
                    onChange={(e) => setHolder(e.target.value)}
                  >
                    <option value="">Fondos propios del propietario</option>
                    {cash?.people.map((p) => (
                      <option key={p.id} value={p.id}>
                        Efectivo de {p.name} · {money(p.balance_cents)}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <p>
                  <strong>
                    Efectivo a tu cargo:{" "}
                    {cash ? money(cash.balance_cents) : "Cargando…"}
                  </strong>
                </p>
              )}
              {user.role === "assistant" &&
              cash &&
              cash.balance_cents < (bill.remaining_cents || 0) ? (
                <p className="form-error">
                  Falta registrar una entrega de efectivo suficiente.
                </p>
              ) : null}
            </div>
          ) : method === "Portal de entidad" ? (
            <div>
              <p>
                Continúa en el portal oficial de{" "}
                <strong>{bill.supplier}</strong>. Allí la entidad muestra sus
                métodos disponibles y, cuando corresponda, el QR de pago.
              </p>
              {url ? (
                <a
                  className="button primary"
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir portal de {bill.supplier}
                  <ExternalLink size={16} />
                </a>
              ) : (
                <div className="notice">
                  El propietario debe configurar la dirección oficial del
                  proveedor.
                </div>
              )}
            </div>
          ) : (
            <div>
              <p>
                {["Yape", "Plin"].includes(method)
                  ? `Abre ${method} y utiliza el destinatario o QR autorizado por ${bill.supplier}. El sistema no genera un QR ni acredita un pago por elegir el método.`
                  : `Realiza el pago mediante ${method.toLowerCase()} usando los datos del proveedor.`}
              </p>
              <dl className="bank-details">
                <div>
                  <dt>Destinatario</dt>
                  <dd>{bill.supplier}</dd>
                </div>
                <div>
                  <dt>Banco</dt>
                  <dd>
                    {bill.bank || "Consultar en el recibo o portal oficial"}
                  </dd>
                </div>
                <div>
                  <dt>Cuenta / CCI</dt>
                  <dd>{bill.account || "No registrada"}</dd>
                </div>
                <div>
                  <dt>Referencia / contrato</dt>
                  <dd>
                    {bill.service_reference ||
                      bill.reference ||
                      "Consultar en el recibo"}
                  </dd>
                </div>
              </dl>
            </div>
          )}
          {!unavailable || method === "Efectivo" ? (
            <>
              <p className="payment-disclaimer">
                {method === "Efectivo"
                  ? "Al registrar la constancia se descontará el importe del efectivo seleccionado. La entrega y el pago deben haber ocurrido físicamente."
                  : "Seleccionar un método o abrir el portal no marca el pago como realizado. La autorización de la transferencia se completa en el banco o billetera."}
              </p>
              {!register ? (
                <button
                  className="button outline-green"
                  disabled={
                    method === "Efectivo" &&
                    user.role === "assistant" &&
                    (!cash || cash.balance_cents < (bill.remaining_cents || 0))
                  }
                  onClick={() => setRegister(true)}
                >
                  <Upload size={16} />
                  Registrar pago y constancia
                </button>
              ) : (
                <form
                  className="payment-record-form"
                  onSubmit={async (e) => {
                    const f = formData(e);
                    setBusy(true);
                    setError("");
                    try {
                      const receipt = await receiptPayload(
                        f.get("receipt") as File,
                      );
                      await send(`/bills/${bill.id}/payments`, {
                        amount_cents: bill.remaining_cents,
                        method,
                        cash_holder_id:
                          method === "Efectivo"
                            ? user.role === "assistant"
                              ? user.id
                              : holder
                                ? Number(holder)
                                : null
                            : undefined,
                        operation: f.get("operation"),
                        receipt,
                      });
                      setRegister(false);
                      onChanged();
                      notify(
                        "Pago registrado. Comprobante pendiente de revisión.",
                      );
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <span className="payment-step">
                    3 · Guardar la constancia
                  </span>
                  <Field
                    label="Importe a registrar (S/)"
                    hint="Corresponde al pendiente del pago creado y no se puede editar."
                  >
                    <input
                      type="text"
                      readOnly
                      value={money(bill.remaining_cents)}
                      aria-readonly="true"
                    />
                  </Field>
                  <Field label="Número de operación">
                    <input
                      name="operation"
                      minLength={3}
                      maxLength={100}
                      required
                      placeholder={
                        method === "Efectivo"
                          ? "Número de recibo o constancia de caja"
                          : "Código de la operación realizada"
                      }
                    />
                  </Field>
                  <Field label="Comprobante" hint="PDF, PNG o JPG · hasta 3 MB">
                    <input
                      className="file-input"
                      name="receipt"
                      type="file"
                      accept="application/pdf,image/png,image/jpeg"
                      required
                    />
                  </Field>
                  <label className="checkbox-line">
                    <input type="checkbox" required />
                    Confirmo que el pago fue realizado y que la constancia
                    corresponde a esta obligación.
                  </label>
                  <FormError message={error} />
                  <div className="form-actions">
                    <button
                      className="button"
                      type="button"
                      disabled={busy}
                      onClick={() => setRegister(false)}
                    >
                      Cancelar
                    </button>
                    <Submit busy={busy}>Guardar pago y comprobante</Submit>
                  </div>
                </form>
              )}
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
