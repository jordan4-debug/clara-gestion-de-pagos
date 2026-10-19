import { useState, useEffect } from "react";
import { Plus, Landmark, ChevronDown, ArrowRight } from "lucide-react";
import {
  Modal,
  Field,
  FormError,
  Submit,
  Empty,
  formData,
  Badge,
} from "../components/ui";
import { api, send, money, localToday, solesToCents } from "../lib/api";
import type { Loan, Supplier, Dashboard, User } from "../types";
const loanDate = (date: string) =>
  new Intl.DateTimeFormat("es-PE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/Lima",
  }).format(new Date(`${date}T12:00:00Z`));
export function Loans({
  suppliers,
  user,
  version,
  onChanged,
  onSelect,
}: {
  suppliers: Supplier[];
  user: User;
  version: Dashboard;
  onChanged: () => void;
  onSelect: (id: number) => void;
}) {
  const [items, setItems] = useState<Loan[]>([]),
    [error, setError] = useState(""),
    [creating, setCreating] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true;
    void api<Loan[]>("/loans")
      .then((x) => {
        if (current) {
          setItems(x);
          setError("");
        }
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [version, retry]);
  return (
    <>
      <div className="report-heading">
        <p className="muted">
          Cada préstamo conserva su contrato y genera una obligación por cuota.
        </p>
        {user.role === "assistant" ? (
          <button className="button primary" onClick={() => setCreating(true)}>
            <Plus size={17} />
            Registrar préstamo
          </button>
        ) : null}
      </div>
      <FormError message={error} />
      {error ? (
        <button className="button" onClick={() => setRetry((n) => n + 1)}>
          Reintentar
        </button>
      ) : null}
      <div className="role-metrics report-metrics">
        <div className="role-metric green">
          <span>Préstamos activos</span>
          <strong>{items.filter((l) => l.remaining_cents > 0).length}</strong>
          <small>{items.length} contratos registrados</small>
        </div>
        <div className="role-metric amber">
          <span>Cuotas pendientes por pagar</span>
          <strong>
            {money(items.reduce((n, l) => n + l.remaining_cents, 0))}
          </strong>
          <small>Importes del cronograma registrado</small>
        </div>
        <div className="role-metric blue">
          <span>Cuotas vencidas</span>
          <strong>
            {items.reduce((n, l) => n + l.overdue_installments, 0)}
          </strong>
          <small>Se considera el día de vencimiento completo</small>
        </div>
      </div>
      <div className="loan-list">
        {items.map((l) => (
          <section className="panel workflow-panel" key={l.id}>
            <div className="panel-title">
              <div className="loan-title">
                <Landmark size={23} />
                <div>
                  <h2>{l.title}</h2>
                  <p className="muted">
                    {l.supplier}
                    {l.reference ? ` · Contrato ${l.reference}` : ""}
                  </p>
                </div>
              </div>
              <span
                className={`review-status ${l.remaining_cents ? "pending" : "verified"}`}
              >
                {l.remaining_cents ? "En curso" : "Completado"}
              </span>
            </div>
            <dl className="loan-summary">
              <div>
                <dt>Capital registrado</dt>
                <dd>{money(l.principal_cents)}</dd>
              </div>
              <div>
                <dt>Total del cronograma</dt>
                <dd>{money(l.total_cents)}</dd>
              </div>
              <div>
                <dt>Pagado</dt>
                <dd>{money(l.paid_cents)}</dd>
              </div>
              <div>
                <dt>Pendiente</dt>
                <dd>{money(l.remaining_cents)}</dd>
              </div>
            </dl>
            <div className="loan-progress">
              <progress
                aria-label={`Cuotas pagadas de ${l.title}`}
                value={l.paid_installments}
                max={l.installment_count}
              />
              <span>
                {l.paid_installments} de {l.installment_count} cuotas pagadas
              </span>
            </div>
            {l.next_due_date ? (
              <p className="muted loan-next">
                Próxima cuota pendiente: {loanDate(l.next_due_date)}
              </p>
            ) : null}
            {l.notes ? <p className="notes">{l.notes}</p> : null}
            <details className="loan-schedule">
              <summary>
                Ver cronograma de cuotas <ChevronDown size={17} />
              </summary>
              <div className="table-scroll">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Cuota</th>
                      <th>Vencimiento</th>
                      <th>Importe</th>
                      <th>Estado</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {l.installments.map((b) => (
                      <tr key={b.id}>
                        <th scope="row">
                          {b.installment_number}/{l.installment_count}
                        </th>
                        <td>{loanDate(b.due_date)}</td>
                        <td>{money(b.amount_cents)}</td>
                        <td>
                          <Badge status={b.status} />
                        </td>
                        <td>
                          <button
                            className="text-button"
                            onClick={() => onSelect(b.id)}
                          >
                            {b.status === "Pagado"
                              ? "Ver constancia"
                              : "Ver y pagar"}
                            <ArrowRight size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
        ))}
      </div>
      {!items.length && !error ? (
        <Empty text="Todavía no hay préstamos registrados." />
      ) : null}
      {creating && user.role === "assistant" ? (
        <LoanForm
          suppliers={suppliers.filter((s) => s.category === "Préstamos")}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            onChanged();
          }}
        />
      ) : null}
    </>
  );
}
function LoanForm({
  suppliers,
  onClose,
  onSaved,
}: {
  suppliers: Supplier[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [count, setCount] = useState(12),
    [quota, setQuota] = useState(""),
    [last, setLast] = useState("");
  const total =
    (Number(quota) || 0) * 100 * Math.max(0, (count || 1) - 1) +
    (Number(last || quota) || 0) * 100;
  return (
    <Modal title="Registrar préstamo y cronograma" onClose={onClose} wide>
      <form
        className="form-body"
        onSubmit={async (e) => {
          const f = formData(e);
          setBusy(true);
          setError("");
          try {
            await send("/loans", {
              title: f.get("title"),
              supplier_id: Number(f.get("supplier_id")),
              principal_cents: solesToCents(f.get("principal")),
              installment_cents: solesToCents(f.get("quota")),
              last_installment_cents: last
                ? solesToCents(f.get("last"))
                : undefined,
              installments: Number(f.get("count")),
              first_due_date: f.get("first_due_date"),
              reference: f.get("reference"),
              notes: f.get("notes"),
            });
            onSaved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Nombre del préstamo">
          <input
            name="title"
            minLength={3}
            maxLength={120}
            required
            autoFocus
            placeholder="Ej. Préstamo de capital de trabajo"
          />
        </Field>
        <div className="form-grid">
          <Field label="Entidad financiera">
            <select name="supplier_id" required defaultValue="">
              <option value="" disabled>
                Selecciona una entidad
              </option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Número de contrato (opcional)">
            <input name="reference" maxLength={120} />
          </Field>
        </div>
        <div className="form-grid">
          <Field label="Capital del préstamo (S/)">
            <input
              type="number"
              name="principal"
              required
              min="0.01"
              max="1000000"
              step="0.01"
            />
          </Field>
          <Field label="Número de cuotas pendientes">
            <input
              name="count"
              type="number"
              min={1}
              max={120}
              required
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            />
          </Field>
        </div>
        <div className="form-grid">
          <Field label="Importe de cada cuota (S/)">
            <input
              name="quota"
              type="number"
              required
              min="0.01"
              max="1000000"
              step="0.01"
              value={quota}
              onChange={(e) => setQuota(e.target.value)}
            />
          </Field>
          <Field
            label="Última cuota (S/) · opcional"
            hint="Vacío: igual a las demás cuotas."
          >
            <input
              name="last"
              type="number"
              min="0.01"
              max="1000000"
              step="0.01"
              value={last}
              onChange={(e) => setLast(e.target.value)}
            />
          </Field>
        </div>
        <Field
          label="Primer vencimiento pendiente"
          hint="Las siguientes cuotas se generan mensualmente. En meses cortos se ajusta al último día."
        >
          <input
            name="first_due_date"
            type="date"
            required
            min={localToday()}
            defaultValue={localToday()}
          />
        </Field>
        <Field label="Notas (opcional)">
          <textarea name="notes" rows={2} maxLength={2000} />
        </Field>
        <div className="notice">
          <strong>Total del cronograma: {money(Math.round(total))}</strong>
          <p>
            Ingresa los importes de tu contrato. El sistema no calcula intereses
            ni cambia las cuotas después de registrarlas.
          </p>
        </div>
        {!suppliers.length ? (
          <FormError message="El propietario debe crear una entidad de la categoría Préstamos." />
        ) : null}
        <FormError message={error} />
        <div className="form-actions">
          <button
            className="button"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <Submit busy={busy || !suppliers.length}>
            Crear préstamo y cuotas
          </Submit>
        </div>
      </form>
    </Modal>
  );
}
