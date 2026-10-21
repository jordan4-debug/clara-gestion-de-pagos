import { MoneyInput } from "../components/MoneyInput";
import { useState, useEffect } from "react";
import { Banknote, Plus, Undo2 } from "lucide-react";
import {
  Modal,
  Field,
  FormError,
  Submit,
  formData,
  Empty,
} from "../components/ui";
import {
  api,
  send,
  money,
  solesToCents,
  dateTime,
  localToday,
} from "../lib/api";
import type { User, CashData } from "../types";
import { CashActivity } from "./CashActivity";
const labels = {
  delivery: "Entrega al asistente",
  expense: "Pago con el fondo entregado",
  return: "Devolución al gerente",
};
export function Cash({
  user,
  month,
  refreshKey,
  onChanged,
  onSelect,
}: {
  user: User;
  month: string;
  refreshKey: object | null;
  onChanged: () => void;
  onSelect?: (id: number) => void;
}) {
  const [data, setData] = useState<CashData | null>(null),
    [error, setError] = useState(""),
    [kind, setKind] = useState<"delivery" | "return" | null>(null),
    [version, setVersion] = useState(0),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    let controller: AbortController | null = null;
    const load = async () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        const d = await api<CashData>(`/cash?month=${month}`, {
          signal: request.signal,
        });
        if (live && !request.signal.aborted) {
          setData(d);
          setError("");
        }
      } catch (e) {
        if (live && !request.signal.aborted) setError((e as Error).message);
      }
    };
    void load();
    const updateVisible = () => {
      if (!document.hidden) void load();
    };
    const focus = () => {
      void load();
    };
    const timer = window.setInterval(updateVisible, 15000);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", updateVisible);
    return () => {
      live = false;
      controller?.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", updateVisible);
    };
  }, [month, version, refreshKey]);
  const changed = () => {
    setKind(null);
    setVersion((v) => v + 1);
    onChanged();
  };
  return (
    <>
      <div className="workflow-note">
        <Banknote size={23} />
        <p>
          Controla el dinero entregado al asistente, lo utilizado para pagar
          recibos y lo devuelto. Cada pago identifica el origen del dinero y su
          constancia.
        </p>
      </div>
      <FormError message={error} />
      {error ? (
        <button className="button" onClick={() => setVersion((v) => v + 1)}>
          Reintentar
        </button>
      ) : null}
      {data ? (
        <>
          <div className="report-heading">
            <p className="muted">
              Entregado, utilizado y devuelto en el mes seleccionado. El saldo
              por rendir incluye los meses anteriores. Se actualiza
              automáticamente cada 15 segundos.
            </p>
            <div className="button-row">
              {user.role === "owner" ? (
                <button
                  className="button primary"
                  onClick={() => {
                    setError("");
                    setKind("delivery");
                  }}
                >
                  <Plus size={18} />
                  Registrar entrega
                </button>
              ) : null}
              <button
                className="button"
                disabled={!data.balance_cents}
                onClick={() => {
                  setError("");
                  setKind("return");
                }}
              >
                <Undo2 size={17} />
                Registrar devolución
              </button>
            </div>
          </div>
          <div className="role-metrics monthly-metrics">
            {[
              ["Entregado este mes", data.totals.delivered],
              ["Utilizado del fondo este mes", data.totals.spent],
              ["Devuelto este mes", data.totals.returned],
              ["Saldo por rendir", data.balance_cents],
            ].map(([label, n]) => (
              <div key={label} className="role-metric green">
                <span>{label}</span>
                <strong>{money(Number(n))}</strong>
              </div>
            ))}
          </div>
          <section className="panel workflow-panel cash-reconciliation">
            <h2>Cuadre de efectivo del mes</h2>
            <p>
              Saldo inicial{" "}
              <strong>{money(data.reconciliation.opening_cents)}</strong> +
              entregas <strong>{money(data.totals.delivered)}</strong> − pagos
              con el fondo <strong>{money(data.totals.spent)}</strong> −
              devoluciones <strong>{money(data.totals.returned)}</strong> =
              saldo al cierre{" "}
              <strong>{money(data.reconciliation.closing_cents)}</strong>.
            </p>
            <p className="muted">
              Los pagos con dinero entregado por el gerente descuentan del
              fondo, también por transferencia, Yape o Plin. Los pagos con otros
              fondos se muestran abajo con cargo S/ 0.00. Una devolución
              registra dinero devuelto al gerente.
            </p>
          </section>
          {data.people.length ? (
            <section className="panel workflow-panel">
              <h2>Fondo a cargo de cada asistente</h2>
              {data.people.map((p) => (
                <div className="cash-person" key={p.id}>
                  <span>
                    {p.name}
                    {!p.active ? " · cuenta inactiva" : ""}
                  </span>
                  <strong>{money(p.balance_cents)}</strong>
                </div>
              ))}
            </section>
          ) : null}
          <CashActivity
            entries={data.payment_activity || []}
            onSelect={onSelect}
          />
          <section className="panel workflow-panel">
            <h2>Movimientos del mes</h2>
            {data.movements.length ? (
              <div className="cash-list">
                {data.movements.map((m) => (
                  <article key={m.id}>
                    <div>
                      <strong>{labels[m.kind]}</strong>
                      <p>{m.note}</p>
                      {m.payment_method ? (
                        <small>Medio utilizado: {m.payment_method}</small>
                      ) : null}
                      <small>
                        {data.people.find((p) => p.id === m.holder_id)?.name} ·{" "}
                        {m.actor}
                        {!m.movement_date ? ` · ${dateTime(m.created_at)}` : ""}
                      </small>
                      {m.movement_date ? (
                        <small>
                          Fecha del movimiento:{" "}
                          {m.movement_date.split("-").reverse().join("/")} ·
                          Registro: {dateTime(m.created_at)}
                        </small>
                      ) : null}
                    </div>
                    <strong>
                      {m.kind === "delivery" ? "+" : "−"}
                      {money(m.amount_cents)}
                    </strong>
                  </article>
                ))}
              </div>
            ) : (
              <Empty text="No hay movimientos de efectivo en este mes." />
            )}
          </section>
        </>
      ) : (
        <p role="status">Cargando efectivo…</p>
      )}
      {kind && data ? (
        <Modal
          title={
            kind === "delivery"
              ? "Registrar entrega de efectivo"
              : "Registrar devolución de efectivo"
          }
          onClose={() => setKind(null)}
          busy={busy}
        >
          <form
            className="form-body"
            onSubmit={async (e) => {
              const f = formData(e);
              setBusy(true);
              setError("");
              try {
                await send("/cash", {
                  kind,
                  holder_id: Number(f.get("holder_id")),
                  amount_cents: solesToCents(f.get("amount")),
                  movement_date: f.get("movement_date"),
                  note: f.get("note"),
                });
                changed();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {kind === "return" ? (
              <p className="notice">
                Usa esta opción solo si devolviste dinero al gerente. Si pagaste
                un recibo, abre la deuda y registra el pago con origen «Dinero
                entregado por el gerente» y su constancia.
              </p>
            ) : null}
            <Field label="Asistente a cargo">
              <select
                name="holder_id"
                required
                defaultValue={user.role === "assistant" ? user.id : ""}
              >
                <option value="" disabled>
                  Selecciona al asistente
                </option>
                {data.people
                  .filter((p) => kind === "return" || p.active)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · por rendir {money(p.balance_cents)}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Importe en soles">
              <MoneyInput name="amount" />
            </Field>
            <Field
              label="Fecha del movimiento"
              hint="Permite registrar entregas o devoluciones históricas; conserva la fecha real de registro."
            >
              <input
                name="movement_date"
                type="date"
                required
                min="1900-01-01"
                max={localToday()}
                defaultValue={
                  month < localToday().slice(0, 7)
                    ? `${month}-01`
                    : localToday()
                }
              />
            </Field>
            <Field label="Motivo o referencia">
              <input
                name="note"
                minLength={5}
                maxLength={500}
                required
                placeholder="Ej. Efectivo para recibos de servicios"
              />
            </Field>
            <p className="info-text">
              Registra una entrega o devolución que ya ocurrió. Los pagos
              realizados con el fondo se descuentan al guardar su constancia
              dentro del recibo.
            </p>
            <FormError message={error} />
            <div className="form-actions">
              <button
                className="button"
                type="button"
                disabled={busy}
                onClick={() => setKind(null)}
              >
                Cancelar
              </button>
              <Submit busy={busy}>Guardar movimiento</Submit>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
