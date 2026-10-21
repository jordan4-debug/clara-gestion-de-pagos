import { useState, useEffect, useRef } from "react";
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
import { MoneyInput } from "../components/MoneyInput";
import { EntitySelector } from "../components/EntitySelector";
import type {
  Loan,
  Supplier,
  Dashboard,
  User,
  LoanPreview,
  Bill,
} from "../types";
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
  onSupplierCreated,
}: {
  suppliers: Supplier[];
  user: User;
  version: Dashboard;
  onChanged: () => void;
  onSelect: (id: number) => void;
  onSupplierCreated?: (supplier: Supplier) => void;
}) {
  const [items, setItems] = useState<Loan[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
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
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [version, retry]);
  return (
    <>
      <div className="report-heading">
        <p className="muted">
          Controla los préstamos ya contratados y los vencimientos de sus
          cuotas. El asistente los registra y el gerente supervisa su
          cumplimiento.
        </p>
        {user.role === "assistant" ? (
          <button className="button primary" onClick={() => setCreating(true)}>
            <Plus size={17} />
            Registrar préstamo
          </button>
        ) : null}
      </div>
      <FormError message={error} />
      {loading ? (
        <p className="muted" role="status">
          Cargando préstamos…
        </p>
      ) : null}
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
            {l.annual_interest_percent != null && l.first_due_date ? (
              <p className="muted loan-next">
                Primer vencimiento: {loanDate(l.first_due_date)} · Tasa anual
                nominal: {l.annual_interest_percent}% · Tasa mensual: anual ÷ 12
                {l.double_months?.length
                  ? ` · Meses dobles: ${l.double_months.map((month) => monthNames[month - 1]).join(", ")}`
                  : " · Sin cuotas dobles"}
              </p>
            ) : null}
            {l.calculation_method && l.disbursement_date ? (
              <p className="muted loan-next">
                Desembolso: {loanDate(l.disbursement_date)} · Interés total:{" "}
                {l.total_interest_percent}%
                {l.double_months?.length
                  ? ` · Meses dobles: ${l.double_months.map((month) => monthNames[month - 1]).join(", ")}`
                  : " · Sin cuotas dobles"}
              </p>
            ) : null}
            {l.notes ? <p className="notes">{l.notes}</p> : null}
            <details className="loan-schedule">
              <summary>
                Ver cronograma de cuotas <ChevronDown size={17} />
              </summary>
              {l.calculation_method ? (
                <p className="muted">
                  Los saldos muestran el capital programado. El estado de cada
                  cuota refleja los pagos registrados.
                </p>
              ) : null}
              <ScheduleTable rows={l.installments} onSelect={onSelect} />
            </details>
          </section>
        ))}
      </div>
      {!items.length && !error && !loading ? (
        <Empty text="Todavía no hay préstamos registrados." />
      ) : null}
      {creating && user.role === "assistant" ? (
        <LoanForm
          suppliers={suppliers.filter((s) => s.category === "Préstamos")}
          onSupplierCreated={onSupplierCreated}
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
const monthNames = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export function ScheduleTable({
  rows,
  onSelect,
}: {
  rows: (Pick<
    Bill,
    | "due_date"
    | "amount_cents"
    | "installment_number"
    | "is_double"
    | "opening_balance_cents"
    | "interest_cents"
    | "amortization_cents"
    | "closing_balance_cents"
  > & { id?: number; status?: string })[];
  onSelect?: (id: number) => void;
}) {
  const calculated =
    rows.length > 0 && rows.every((row) => row.opening_balance_cents != null);
  return (
    <div
      className="table-scroll"
      tabIndex={0}
      role="region"
      aria-label="Cronograma de cuotas"
    >
      <table
        className={`report-table ${calculated ? "calculated-schedule" : ""}`}
      >
        <thead>
          <tr>
            <th>Cuota</th>
            <th>Vencimiento</th>
            {calculated ? (
              <>
                <th>Tipo</th>
                <th>Saldo inicial</th>
                <th>Interés</th>
                <th>Amortización</th>
              </>
            ) : null}
            <th>Cuota a pagar</th>
            {calculated ? <th>Saldo final</th> : null}
            {onSelect ? (
              <>
                <th>Estado</th>
                <th>Acción</th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.installment_number}>
              <th scope="row">{row.installment_number}</th>
              <td>{loanDate(row.due_date)}</td>
              {calculated ? (
                <>
                  <td>{row.is_double ? "Doble" : "Normal"}</td>
                  <td>{money(row.opening_balance_cents!)}</td>
                  <td>{money(row.interest_cents!)}</td>
                  <td>{money(row.amortization_cents!)}</td>
                </>
              ) : null}
              <td>{money(row.amount_cents)}</td>
              {calculated ? <td>{money(row.closing_balance_cents!)}</td> : null}
              {onSelect && row.id != null ? (
                <>
                  <td>
                    <Badge status={row.status || "Pendiente"} />
                  </td>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => onSelect(row.id!)}
                    >
                      {row.status === "Pagado"
                        ? "Ver constancia"
                        : "Ver detalle"}
                      <ArrowRight size={15} />
                    </button>
                  </td>
                </>
              ) : null}
            </tr>
          ))}
        </tbody>
        {calculated ? (
          <tfoot>
            <tr>
              <th colSpan={4}>Totales</th>
              <td>
                {money(rows.reduce((sum, row) => sum + row.interest_cents!, 0))}
              </td>
              <td>
                {money(
                  rows.reduce((sum, row) => sum + row.amortization_cents!, 0),
                )}
              </td>
              <td>
                {money(rows.reduce((sum, row) => sum + row.amount_cents!, 0))}
              </td>
              <td>{money(rows.at(-1)!.closing_balance_cents!)}</td>
              {onSelect ? <td colSpan={2} /> : null}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

function scheduleParameters(f: FormData) {
  const percent = String(f.get("annual_interest_percent") || "");
  return {
    principal_cents: solesToCents(f.get("principal")),
    annual_interest_percent: percent,
    first_due_date: String(f.get("first_due_date") || ""),
    installments: Number(f.get("count")),
    double_months: f.getAll("double_months").map(Number),
  };
}
export function LoanForm({
  suppliers,
  onClose,
  onSaved,
  onSupplierCreated,
}: {
  suppliers: Supplier[];
  onClose: () => void;
  onSaved: () => void;
  onSupplierCreated?: (supplier: Supplier) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [parameters, setParameters] = useState("");
  const [preview, setPreview] = useState<LoanPreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const previewVersion = useRef(0);
  useEffect(() => {
    if (!parameters) return;
    const version = previewVersion.current;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void api<LoanPreview>("/loans/preview", {
        method: "POST",
        body: parameters,
        signal: controller.signal,
      })
        .then((result) => {
          if (!controller.signal.aborted && version === previewVersion.current)
            setPreview(result);
        })
        .catch((e) => {
          if (!controller.signal.aborted && version === previewVersion.current)
            setPreviewError((e as Error).message);
        })
        .finally(() => {
          if (!controller.signal.aborted && version === previewVersion.current)
            setPreviewBusy(false);
        });
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [parameters]);
  return (
    <Modal
      title="Registrar préstamo y cronograma"
      onClose={onClose}
      wide
      busy={busy}
    >
      <form
        className="form-body"
        onChange={(e) => {
          try {
            const values = scheduleParameters(new FormData(e.currentTarget));
            const next =
              values.principal_cents &&
              values.annual_interest_percent !== "" &&
              values.first_due_date &&
              values.installments
                ? JSON.stringify(values)
                : "";
            if (next !== parameters) {
              previewVersion.current++;
              setPreview(null);
              setPreviewError("");
              setPreviewBusy(!!next);
              setParameters(next);
            }
          } catch {
            previewVersion.current++;
            setParameters("");
            setPreview(null);
            setPreviewBusy(false);
          }
        }}
        onSubmit={async (e) => {
          const f = formData(e);
          setBusy(true);
          setError("");
          try {
            await send("/loans", {
              ...scheduleParameters(f),
              title: f.get("title"),
              supplier_id: Number(f.get("supplier_id")),
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
        <p className="muted">
          Registra el capital y las condiciones del préstamo. Puedes ingresar
          vencimientos de meses o años anteriores. Las cuotas históricas se
          registran pendientes; sus pagos se acreditan por separado.
        </p>
        <Field label="Nombre del préstamo">
          <input
            name="title"
            required
            minLength={3}
            maxLength={120}
            placeholder="Ej. Préstamo de capital de trabajo"
          />
        </Field>
        <div className="form-grid">
          <EntitySelector
            suppliers={suppliers}
            loans
            onCreated={onSupplierCreated}
          />
          <Field label="Número de contrato (opcional)">
            <input name="reference" maxLength={120} />
          </Field>
        </div>
        <div className="form-grid">
          <Field label="Capital del préstamo (S/)">
            <MoneyInput name="principal" />
          </Field>
          <Field
            label="Tasa de interés anual nominal (%)"
            hint="Regla del ejemplo BCP: tasa anual ÷ 12 para obtener la tasa mensual sobre saldo. Hasta dos decimales; 0 si no tiene interés."
          >
            <MoneyInput name="annual_interest_percent" />
          </Field>
        </div>
        <div className="form-grid">
          <Field
            label="Fecha de vencimiento"
            hint="Es el primer vencimiento. Las demás cuotas siguen cada mes; en meses cortos se usa el último día disponible."
          >
            <input
              name="first_due_date"
              type="date"
              required
              min="1900-01-01"
              max="2099-12-31"
              defaultValue={localToday()}
            />
          </Field>
          <Field label="Plazo / número de cuotas">
            <input
              name="count"
              type="number"
              step={1}
              min={1}
              max={120}
              required
              defaultValue={12}
            />
          </Field>
        </div>
        <fieldset className="double-months">
          <legend>Meses con cuota doble</legend>
          <p className="muted">
            Se aplican cada año del cronograma. Sin selección: todas las cuotas
            son normales.
          </p>
          <div className="month-options">
            {monthNames.map((name, index) => (
              <label key={name}>
                <input type="checkbox" name="double_months" value={index + 1} />
                {name}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Notas (opcional)">
          <textarea name="notes" rows={2} maxLength={2000} />
        </Field>
        <div className="notice">
          <strong>Método francés con cuotas dobles</strong>
          <p>
            El interés de cada mes se calcula sobre el saldo de capital
            pendiente. La cuota normal se calcula considerando el plazo y los
            meses dobles. La última cuota se ajusta para cerrar el capital en S/
            0.00. Los vencimientos son mensuales; no incluye seguros ni
            comisiones.
          </p>
        </div>
        <section
          className="loan-preview"
          aria-label="Vista previa del préstamo"
          aria-busy={previewBusy}
        >
          {previewBusy ? <p role="status">Calculando cronograma…</p> : null}
          <FormError message={previewError} />
          {preview ? (
            <>
              <h3>Vista previa del cronograma</h3>
              <dl className="loan-summary">
                <div>
                  <dt>Capital</dt>
                  <dd>{money(preview.principal_cents)}</dd>
                </div>
                <div>
                  <dt>Interés total</dt>
                  <dd>{money(preview.interest_total_cents)}</dd>
                </div>
                <div>
                  <dt>Total a pagar</dt>
                  <dd>{money(preview.total_cents)}</dd>
                </div>
                <div>
                  <dt>Cuota normal de referencia</dt>
                  <dd>{money(preview.base_installment_cents)}</dd>
                </div>
              </dl>
              <ScheduleTable rows={preview.schedule} />
            </>
          ) : !previewBusy && !previewError ? (
            <p className="muted">
              Completa capital, tasa, primer vencimiento y plazo para ver todas
              las cuotas antes de guardar.
            </p>
          ) : null}
        </section>
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
          <Submit busy={busy} disabled={!preview || previewBusy}>
            Guardar préstamo y cuotas
          </Submit>
        </div>
      </form>
    </Modal>
  );
}
