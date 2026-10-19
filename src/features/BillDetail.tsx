import { useState, useEffect } from "react";
import { ExternalLink, Copy, Pencil } from "lucide-react";
import { Modal, Badge, FormError } from "../components/ui";
import { api, money, shortDate } from "../lib/api";
import type { Bill, User } from "../types";
import { ReviewCard } from "./Reviews";
import { PaymentFlow } from "./PaymentFlow";
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
    [error, setError] = useState("");
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
                <h3>Datos para pagar</h3>
                {bill.status !== "Pagado" && !bill.pending_attempt ? (
                  <button className="text-button" onClick={() => onEdit(bill)}>
                    <Pencil size={14} />
                    Editar vencimiento y notas
                  </button>
                ) : null}
              </div>
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
                  <dd>{bill.reference || "Sin referencia"}</dd>
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
              {bill.notes ? <p className="notes">{bill.notes}</p> : null}
            </div>
            {bill.amount_cents === null ? (
              <div className="notice">
                <strong>Primero define el monto</strong>
                <p>
                  El gasto ya está en tu lista para que no lo olvides. Actualiza
                  el importe cuando llegue el recibo.
                </p>
                <button
                  className="button outline-green"
                  onClick={() => onEdit(bill)}
                >
                  Definir monto
                </button>
              </div>
            ) : null}
            {bill.status !== "Pagado" && bill.amount_cents !== null ? (
              <PaymentFlow
                bill={bill}
                onChanged={() => {
                  void load();
                  onChanged();
                }}
                notify={notify}
              />
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
