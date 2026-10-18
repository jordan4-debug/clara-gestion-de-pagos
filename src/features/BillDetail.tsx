import { useState, useEffect } from 'react';
import {
  ExternalLink,
  Copy,
  FileText,
  Check,
  ShieldCheck,
  LockKeyhole,
  Pencil,
  Upload,
  ArrowUpRight,
} from 'lucide-react';
import { Modal, Badge, Field, FormError, Submit, formData } from '../components/ui';
import { api, send, money, shortDate, dateTime, solesToCents } from '../lib/api';
import type { Bill, User, Settings } from '../types';
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
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [register, setRegister] = useState(false),
    [settings, setSettings] = useState<Settings | null>(null),
    [checkoutMessage, setCheckoutMessage] = useState('');
  const load = () => api<Bill>(`/bills/${id}`).then(setBill);
  useEffect(() => {
    void Promise.all([api<Bill>(`/bills/${id}`), api<Settings>('/settings')])
      .then(([b, s]) => {
        setBill(b);
        setSettings(s);
      })
      .catch((e) => setError(e.message));
  }, [id]);
  async function approve(approval: string) {
    setBusy(true);
    setError('');
    try {
      await send(`/bills/${id}/approval`, { approval });
      await load();
      onChanged();
      notify(approval === 'approved' ? 'Pago autorizado.' : 'Pago bloqueado.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={bill?.title || 'Detalle del pago'} onClose={onClose} wide>
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
                  Saldo <b>{money(bill.remaining_cents)}</b>
                </span>
              </div>
            ) : null}
            <div className="detail-section">
              <div className="section-head">
                <h3>Datos para pagar</h3>
                {!bill.paid_cents && !bill.pending_attempt ? (
                  <button className="text-button" onClick={() => onEdit(bill)}>
                    <Pencil size={14} />
                    Editar
                  </button>
                ) : null}
              </div>
              <dl className="bank-details">
                <div>
                  <dt>Banco</dt>
                  <dd>{bill.bank || 'No registrado'}</dd>
                </div>
                <div>
                  <dt>Cuenta / CCI</dt>
                  <dd>
                    {bill.account || 'No registrada'}
                    {bill.account ? (
                      <button
                        className="icon-button"
                        aria-label="Copiar cuenta"
                        onClick={() => {
                          void navigator.clipboard
                            .writeText(bill.account!)
                            .then(() => notify('Cuenta copiada.'))
                            .catch(() =>
                              notify('No se pudo copiar. Selecciona la cuenta manualmente.'),
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
                  <dd>{bill.reference || 'Sin referencia'}</dd>
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
            {bill.approval !== 'approved' ? (
              <div className="authorization">
                <ShieldCheck size={22} />
                <div>
                  <strong>
                    {bill.approval === 'blocked'
                      ? 'Pago detenido por el propietario'
                      : 'Este pago requiere autorización'}
                  </strong>
                  <p>El asistente podrá registrarlo después de que el propietario lo autorice.</p>
                </div>
                {user.role === 'owner' ? (
                  <button
                    className="button outline-green"
                    disabled={busy}
                    onClick={() => void approve('approved')}
                  >
                    Autorizar
                  </button>
                ) : null}
              </div>
            ) : user.role === 'owner' && bill.status !== 'Pagado' && !bill.pending_attempt ? (
              <button
                className="text-button stop-button"
                disabled={busy}
                onClick={() => void approve('blocked')}
              >
                <LockKeyhole size={14} />
                Detener este pago
              </button>
            ) : null}
            {bill.pending_attempt ? (
              <div className="notice amber-notice">
                <strong>Hay una operación de pasarela pendiente.</strong>
                <p>
                  Revisa CulqiPanel antes de pagar otra vez. El propietario puede conciliarla en
                  Configuración.
                </p>
              </div>
            ) : null}
            {bill.amount_cents === null ? (
              <div className="notice">
                <strong>Primero define el monto</strong>
                <p>
                  El gasto ya está en tu lista para que no lo olvides. Actualiza el importe cuando
                  llegue el recibo.
                </p>
                <button className="button outline-green" onClick={() => onEdit(bill)}>
                  Definir monto
                </button>
              </div>
            ) : null}
            {bill.status !== 'Pagado' &&
            bill.amount_cents !== null &&
            bill.approval === 'approved' &&
            !bill.pending_attempt ? (
              <section className="detail-section">
                <h3>
                  {bill.channel === 'culqi'
                    ? 'Pago al comercio · Culqi'
                    : 'Registrar un pago realizado'}
                </h3>
                {bill.channel === 'culqi' ? (
                  <>
                    <p className="muted">
                      El dinero se abona a <strong>{settings?.payment.merchant}</strong>, comercio
                      de las llaves configuradas. Este pago no cancela deudas de SAT, SUNAT ni
                      servicios.
                    </p>
                    <div className="notice">
                      <strong>
                        {settings?.payment.mode === 'live'
                          ? 'Producción · dinero real'
                          : 'Entorno de integración · sin dinero real'}
                      </strong>
                      <p>
                        {settings?.payment.enabled
                          ? 'La tarjeta se ingresa únicamente en el formulario seguro de Culqi.'
                          : 'Pasarela pendiente de configuración. Agrega tus llaves en el archivo .env del servidor.'}
                      </p>
                    </div>
                    <form
                      onSubmit={async (e) => {
                        const f = formData(e);
                        setBusy(true);
                        setCheckoutMessage('');
                        try {
                          const { openCheckout } = await import('../lib/checkout');
                          await openCheckout({
                            bill,
                            config: settings!.payment,
                            email: String(f.get('email')),
                            onDone: () => {
                              notify('Pago confirmado por Culqi.');
                              void load();
                              onChanged();
                            },
                            onMessage: setCheckoutMessage,
                          });
                        } catch (e) {
                          setCheckoutMessage((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <Field label="Correo del titular de la tarjeta">
                        <input
                          type="email"
                          name="email"
                          maxLength={100}
                          required
                          placeholder="titular@correo.com"
                        />
                      </Field>
                      <label className="checkbox-line">
                        <input type="checkbox" required />
                        Confirmo el destinatario y el monto de {money(bill.remaining_cents)}.
                      </label>
                      <button
                        className="button primary full"
                        disabled={busy || !settings?.payment.enabled}
                      >
                        <ArrowUpRight size={16} />
                        {busy ? 'Abriendo…' : `Pagar ${money(bill.remaining_cents)} con Culqi`}
                      </button>
                    </form>
                    {checkoutMessage ? (
                      <p role="status" className="notice">
                        {checkoutMessage}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p className="muted">
                      Realiza el pago en tu banco o en la entidad. Luego adjunta su constancia para
                      que el propietario pueda revisarla.
                    </p>
                    {!register ? (
                      <button className="button primary" onClick={() => setRegister(true)}>
                        <Upload size={16} />
                        Adjuntar comprobante y registrar
                      </button>
                    ) : (
                      <form
                        onSubmit={async (e) => {
                          const f = formData(e);
                          const file = f.get('receipt') as File;
                          if (!file || file.size > 3 * 1024 * 1024) {
                            setError('Selecciona un comprobante de hasta 3 MB.');
                            return;
                          }
                          setBusy(true);
                          setError('');
                          try {
                            const base64 = await new Promise<string>((resolve, reject) => {
                              const reader = new FileReader();
                              reader.onload = () => resolve(String(reader.result).split(',')[1]);
                              reader.onerror = reject;
                              reader.readAsDataURL(file);
                            });
                            await send(`/bills/${id}/payments`, {
                              amount_cents: solesToCents(f.get('amount')),
                              method: f.get('method'),
                              operation: f.get('operation'),
                              receipt: { name: file.name, mime: file.type, base64 },
                            });
                            setRegister(false);
                            await load();
                            onChanged();
                            notify('Pago y comprobante guardados.');
                          } catch (e) {
                            setError((e as Error).message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <div className="form-grid">
                          <Field label="Monto abonado (S/)">
                            <input
                              type="number"
                              name="amount"
                              required
                              min="0.01"
                              step="0.01"
                              max={(bill.remaining_cents || 0) / 100}
                              defaultValue={(bill.remaining_cents || 0) / 100}
                            />
                          </Field>
                          <Field label="Medio de pago">
                            <select name="method">
                              {['Transferencia', 'Ventanilla', 'Portal de entidad', 'Otro'].map(
                                (x) => (
                                  <option key={x}>{x}</option>
                                ),
                              )}
                            </select>
                          </Field>
                        </div>
                        <Field label="Número de operación">
                          <input
                            name="operation"
                            required
                            minLength={3}
                            maxLength={100}
                            placeholder="Número que figura en tu comprobante"
                          />
                        </Field>
                        <Field label="Voucher / comprobante" hint="PDF, PNG o JPG · hasta 3 MB">
                          <input
                            className="file-input"
                            type="file"
                            name="receipt"
                            accept="application/pdf,image/png,image/jpeg"
                            required
                          />
                        </Field>
                        <label className="checkbox-line">
                          <input type="checkbox" required />
                          Confirmo que este pago ya fue realizado y el comprobante corresponde al
                          abono.
                        </label>
                        <div className="form-actions">
                          <button
                            className="button"
                            type="button"
                            onClick={() => setRegister(false)}
                          >
                            Cancelar
                          </button>
                          <Submit busy={busy}>Registrar abono</Submit>
                        </div>
                      </form>
                    )}
                  </>
                )}
              </section>
            ) : null}
            <section className="detail-section">
              <h3>Abonos y comprobantes</h3>
              {bill.payments?.length ? (
                bill.payments.map((p) => (
                  <article key={p.id} className="payment-record">
                    <Check size={19} />
                    <div>
                      <strong>
                        {money(p.amount_cents)} · {p.method}
                      </strong>
                      <p>Operación {p.operation}</p>
                      <small>
                        {p.actor} · {dateTime(p.created_at)}
                      </small>
                      {p.receipt_id ? (
                        <a
                          className="text-button inline-link"
                          target="_blank"
                          rel="noreferrer"
                          href={`/api/receipts/${p.receipt_id}`}
                        >
                          <FileText size={14} />
                          Abrir {p.receipt_name}
                        </a>
                      ) : (
                        <p className="verified">Confirmación del servidor de Culqi</p>
                      )}
                    </div>
                  </article>
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
