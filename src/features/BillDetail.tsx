import { useState, useEffect } from "react";
import { ExternalLink, Copy, Pencil } from "lucide-react";
import { Modal, Badge, FormError } from "../components/ui";
import { api, send, money, shortDate } from "../lib/api";
import type { Bill, User } from "../types";
import { ReviewCard, receiptPayload } from "./Reviews";
import { PaymentFlow } from "./PaymentFlow";
import { SimulatedPayment } from "./SimulatedPayment";
export function BillDetail({
  id,
  user,
  onClose,
  onChanged,
  onEdit,
  notify,
}: {
  id: number;
  user: User;
  onClose: () => void;
  onChanged: () => void;
  onEdit: (bill: Bill) => void;
  notify: (s: string) => void;
}) {
  const [bill, setBill] = useState<Bill | null>(null),
    [error, setError] = useState(""),
    [uploading, setUploading] = useState(false);
  const load = () => api<Bill>(`/bills/${id}`).then(setBill);
  useEffect(() => {
    void api<Bill>(`/bills/${id}`)
      .then(setBill)
      .catch((e) => setError(e.message));
  }, [id]);
  return (
    <Modal title={bill?.title || "Detalle del pago"} onClose={onClose} wide>
      <div className="detail-body">
        <FormError message={error} />
        {bill ? (
          <>
            <div className="detail-overview">
              <div>
                <p>{bill.supplier}</p>
                <strong>{money(bill.amount_cents)}</strong>
                <small>
                  Vence el {shortDate(bill.due_date)} · {bill.month}
                </small>
              </div>
              <Badge status={bill.status} />
            </div>
            {bill.paid_cents > 0 ? (
              <div className="balance-strip">
                <span>
                  Abonado <b>{money(bill.paid_cents)}</b>
                </span>
                <span>
                  Pendiente <b>{money(bill.remaining_cents)}</b>
                </span>
              </div>
            ) : null}
            <div className="detail-section">
              <div className="section-head">
                <h3>Detalle de la deuda</h3>
                {user.role === "assistant" &&
                bill.status !== "Pagado" &&
                !bill.pending_attempt ? (
                  <button className="text-button" onClick={() => onEdit(bill)}>
                    <Pencil size={14} />
                    Editar vencimiento y notas
                  </button>
                ) : null}
              </div>
              <details className="provider-information">
                <summary>Ver datos del destinatario</summary>
                <dl className="bank-details">
                  <div>
                    <dt>Banco</dt>
                    <dd>{bill.bank || "No registrado"}</dd>
                  </div>
                  <div>
                    <dt>Cuenta / CCI</dt>
                    <dd>
                      {bill.account || "No registrada"}
                      {bill.account ? (
                        <button
                          className="icon-button"
                          aria-label="Copiar cuenta"
                          onClick={() => {
                            void navigator.clipboard
                              .writeText(bill.account!)
                              .then(() => notify("Cuenta copiada."))
                              .catch(() =>
                                notify(
                                  "No se pudo copiar. Selecciona la cuenta manualmente.",
                                ),
                              );
                          }}
                        >
                          <Copy size={14} />
                        </button>
                      ) : null}
                    </dd>
                  </div>
                  <div>
                    <dt>Referencia</dt>
                    <dd>
                      {bill.service_reference ||
                        bill.reference ||
                        "Sin referencia"}
                    </dd>
                  </div>
                </dl>
                {bill.portal ? (
                  <a
                    className="text-button inline-link"
                    href={bill.portal}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir portal de la entidad
                    <ExternalLink size={14} />
                  </a>
                ) : null}
              </details>
              {bill.notes ? <p className="notes">{bill.notes}</p> : null}
            </div>
            <section className="detail-section original-document">
              <h3>Recibo original de la deuda</h3>
              {bill.invoice_number ? (
                <p>
                  Número: <strong>{bill.invoice_number}</strong>
                </p>
              ) : null}
              {bill.invoice_receipt_id ? (
                <a
                  className="button outline-green"
                  href={`/api/receipts/${bill.invoice_receipt_id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir recibo original
                </a>
              ) : (
                <>
                  <p className="muted">
                    {bill.loan_id
                      ? "Esta cuota necesita el recibo original de cobro de la entidad antes de pagar."
                      : "Este registro anterior todavía no tiene su recibo original. Permite contrastar proveedor, referencia e importe antes de pagar."}
                  </p>
                  {user.role === "assistant" ? (
                    <form
                      className="document-upload"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        setUploading(true);
                        setError("");
                        try {
                          await send(`/bills/${bill.id}/document`, {
                            invoice_number: f.get("invoice_number"),
                            receipt: await receiptPayload(
                              f.get("document") as File,
                            ),
                          });
                          await load();
                          onChanged();
                          notify("Recibo original archivado.");
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setUploading(false);
                        }
                      }}
                    >
                      <label className="field">
                        <span>Número del recibo / factura</span>
                        <input name="invoice_number" required maxLength={100} />
                      </label>
                      <label className="field">
                        <span>Adjuntar recibo original</span>
                        <input
                          name="document"
                          type="file"
                          accept="application/pdf,image/png,image/jpeg"
                          required
                        />
                      </label>
                      <button className="button" disabled={uploading}>
                        {uploading ? "Guardando…" : "Guardar recibo original"}
                      </button>
                    </form>
                  ) : null}
                </>
              )}
              {bill.invoice_receipt_id &&
              !bill.invoice_number &&
              user.role === "assistant" ? (
                <form
                  className="document-upload"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    setUploading(true);
                    setError("");
                    try {
                      await send(
                        `/bills/${bill.id}/document`,
                        { invoice_number: f.get("invoice_number") },
                        "PATCH",
                      );
                      await load();
                      onChanged();
                      notify("Número del recibo archivado.");
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setUploading(false);
                    }
                  }}
                >
                  <label className="field">
                    <span>Número del recibo original</span>
                    <input name="invoice_number" required maxLength={100} />
                  </label>
                  <button className="button" disabled={uploading}>
                    Guardar número de recibo
                  </button>
                </form>
              ) : null}
              {bill.created_by ? (
                <small>Registrado por {bill.created_by}</small>
              ) : null}
            </section>
            {bill.amount_cents === null ? (
              <div className="notice">
                <strong>Primero define el monto</strong>
                <p>
                  El gasto ya está en tu lista para que no lo olvides. Actualiza
                  el importe cuando llegue el recibo.
                </p>
                {user.role === "assistant" ? (
                  <button
                    className="button outline-green"
                    onClick={() => onEdit(bill)}
                  >
                    Definir monto
                  </button>
                ) : (
                  <p>
                    El asistente completará el importe al recibir el recibo.
                  </p>
                )}
              </div>
            ) : null}
            {bill.status !== "Pagado" &&
            bill.amount_cents !== null &&
            user.role === "assistant" &&
            bill.invoice_receipt_id &&
            bill.invoice_number ? (
              <SimulatedPayment
                bill={bill}
                onChanged={() => {
                  void load();
                  onChanged();
                }}
                notify={notify}
              />
            ) : null}
            {bill.status !== "Pagado" &&
            (!bill.invoice_receipt_id || !bill.invoice_number) ? (
              <div className="notice">
                El recibo original y su número son obligatorios antes de
                registrar o simular un pago, también para las cuotas de
                préstamos.
              </div>
            ) : null}
            {bill.status !== "Pagado" &&
            bill.amount_cents !== null &&
            bill.invoice_receipt_id &&
            bill.invoice_number &&
            user.role === "assistant" ? (
              <details className="external-payment-disclosure">
                <summary>
                  Registrar pago realizado fuera de Clara (opcional)
                </summary>
                <PaymentFlow
                  bill={bill}
                  user={user}
                  onChanged={() => {
                    void load();
                    onChanged();
                  }}
                  notify={notify}
                />
              </details>
            ) : null}
            <section className="detail-section">
              <h3>Abonos y comprobantes</h3>
              <p className="muted">
                Los abonos son registros declarados. La revisión de una
                constancia no confirma el movimiento con el banco.
              </p>
              {bill.payments?.length ? (
                bill.payments.map((p) => (
                  <ReviewCard
                    key={p.id}
                    payment={p}
                    user={user}
                    onChanged={() => {
                      void load();
                      onChanged();
                    }}
                    notify={notify}
                  />
                ))
              ) : (
                <p className="muted">Todavía no se han registrado abonos.</p>
              )}
            </section>
          </>
        ) : (
          <p className="muted">Cargando detalle…</p>
        )}
      </div>
    </Modal>
  );
}
