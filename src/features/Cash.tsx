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
import { api, send, money, solesToCents, dateTime } from "../lib/api";
import type { User, CashData } from "../types";
const labels = {
  delivery: "Entrega al asistente",
  expense: "Pago en efectivo",
  return: "Devolución al gerente",
};
export function Cash({
  user,
  month,
  refreshKey,
  onChanged,
}: {
  user: User;
  month: string;
  refreshKey: object | null;
  onChanged: () => void;
}) {
  const [data, setData] = useState<CashData | null>(null),
    [error, setError] = useState(""),
    [kind, setKind] = useState<"delivery" | "return" | null>(null),
    [version, setVersion] = useState(0),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void api<CashData>(`/cash?month=${month}`)
      .then((d) => {
        if (live) {
          setData(d);
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
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
          Registra el dinero físico entregado al asistente, los pagos
          respaldados por constancias y las devoluciones. Este registro no mueve
          dinero ni es una billetera.
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
              Entregado, utilizado y devuelto en el mes seleccionado. El
              efectivo por rendir incluye los meses anteriores.
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
              ["Utilizado este mes", data.totals.spent],
              ["Devuelto este mes", data.totals.returned],
              ["Efectivo por rendir", data.balance_cents],
            ].map(([label, n]) => (
              <div key={label} className="role-metric green">
                <span>{label}</span>
                <strong>{money(Number(n))}</strong>
              </div>
            ))}
          </div>
          {data.people.length ? (
            <section className="panel workflow-panel">
              <h2>Efectivo a cargo</h2>
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
          <section className="panel workflow-panel">
            <h2>Movimientos del mes</h2>
            {data.movements.length ? (
              <div className="cash-list">
                {data.movements.map((m) => (
                  <article key={m.id}>
                    <div>
                      <strong>{labels[m.kind]}</strong>
                      <p>{m.note}</p>
                      <small>
                        {data.people.find((p) => p.id === m.holder_id)?.name} ·{" "}
                        {m.actor} · {dateTime(m.created_at)}
                      </small>
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
              Registra una entrega o devolución que ya ocurrió físicamente. Los
              pagos en efectivo se descuentan al guardar su comprobante dentro
              de la deuda.
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
