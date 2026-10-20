import { useState, useEffect } from "react";
import { ExternalLink, Copy, Pencil } from "lucide-react";
import { Modal, Badge, FormError } from "../components/ui";
import { api, send, money, shortDate } from "../lib/api";
import type { Bill, User } from "../types";
import { ReviewCard, receiptPayload } from "./Reviews";
import { PaymentFlow } from "./PaymentFlow";
import { ReceiptFields } from "../components/ReceiptFields";
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
                (!bill.created_by_id || bill.created_by_id === user.id) &&
                bill.status !== "Pagado" &&
                !bill.pending_attempt ? (
                  <button className="text-button" onClick={() => onEdit(bill)}>
                    <Pencil size={14} />
                    Editar vencimiento y notas
                  </button>
                ) : null}
              </div>
              <p className="muted">
                Periodo: {bill.month} · Emisión:{" "}
                {bill.issued_date
                  ? shortDate(bill.issued_date)
                  : "No registrada"}{" "}
                · Último pago:{" "}
                {bill.last_payment_date
                  ? shortDate(bill.last_payment_date)
                  : "Sin pago registrado"}
              </p>
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
                  {user.role === "owner" ||
                  !bill.created_by_id ||
                  bill.created_by_id === user.id ? (
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
                            receipt_format: f.get("receipt_format"),
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
                      <ReceiptFields defaultFormat={bill.receipt_format} />
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
              (user.role === "owner" ||
                !bill.created_by_id ||
                bill.created_by_id === user.id) ? (
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
                        {
                          invoice_number: f.get("invoice_number"),
                          receipt_format: f.get("receipt_format"),
                        },
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
                  <ReceiptFields defaultFormat={bill.receipt_format} />
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
                {user.role === "assistant" &&
                (!bill.created_by_id || bill.created_by_id === user.id) ? (
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
            (!bill.invoice_receipt_id || !bill.invoice_number) ? (
              <div className="notice">
                El recibo original y su número son obligatorios antes de
                registrar el pago realizado.
              </div>
            ) : null}
            {bill.status !== "Pagado" &&
            bill.amount_cents !== null &&
            bill.invoice_receipt_id &&
            bill.invoice_number ? (
              <details className="external-payment-disclosure">
                <summary>Registrar pago</summary>
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
                El registro del pago y la revisión de su constancia son acciones
                administrativas independientes.
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
