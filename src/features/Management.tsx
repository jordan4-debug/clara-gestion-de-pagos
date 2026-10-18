import {
  Plus,
  Pause,
  Play,
  Pencil,
  Repeat2,
  Landmark,
  ExternalLink,
} from "lucide-react";
import { money, dateTime } from "../lib/api";
import { Empty } from "../components/ui";
import type { Supplier, Template, Activity, User } from "../types";
export function Suppliers({
  items,
  user,
  onNew,
  onEdit,
}: {
  items: Supplier[];
  user: User;
  onNew: () => void;
  onEdit: (s: Supplier) => void;
}) {
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Tus proveedores y entidades</h2>
        {user.role === "owner" ? (
          <button className="button primary" onClick={onNew}>
            <Plus size={16} />
            Nuevo proveedor
          </button>
        ) : null}
      </div>
      <p className="section-description">
        Datos bancarios, referencias y portales para tener todo a mano.
      </p>
      <div className="supplier-list">
        {items.map((s) => (
          <article className="supplier-row" key={s.id}>
            <span className="supplier-icon">
              <Landmark size={23} />
            </span>
            <div className="supplier-info">
              <strong>{s.name}</strong>
              <p>
                {s.category} · {"Pago externo"}
              </p>
              <small>
                {s.bank || "Banco por registrar"}
                {s.account ? ` · ${s.account}` : ""}
              </small>
            </div>
            <div className="button-row">
              {s.portal ? (
                <a
                  href={s.portal}
                  target="_blank"
                  rel="noreferrer"
                  className="icon-button"
                  aria-label={`Abrir portal de ${s.name}`}
                >
                  <ExternalLink size={17} />
                </a>
              ) : null}
              {user.role === "owner" ? (
                <button className="button" onClick={() => onEdit(s)}>
                  <Pencil size={14} />
                  Editar
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      {!items.length ? <Empty text="Aún no hay proveedores." /> : null}
    </section>
  );
}
export function Templates({
  items,
  user,
  onNew,
  onToggle,
  onPrepare,
  busy,
}: {
  items: Template[];
  user: User;
  onNew: () => void;
  onToggle: (t: Template) => void;
  onPrepare: () => void;
  busy: boolean;
}) {
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Los gastos que vuelven cada mes</h2>
        {user.role === "owner" ? (
          <button className="button primary" onClick={onNew}>
            <Plus size={16} />
            Nuevo recurrente
          </button>
        ) : null}
      </div>
      <p className="section-description">
        Define una vez. Genera el mes sin duplicados. Los montos variables
        quedan por definir.
      </p>
      <div className="table-scroll">
        <table className="management-table">
          <thead>
            <tr>
              <th>Concepto</th>
              <th>Proveedor</th>
              <th>Vence cada mes</th>
              <th>Monto</th>
              <th>Estado</th>
              <th>
                <span className="sr-only">Acción</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id}>
                <td>
                  <span className="inline-icon">
                    <Repeat2 size={16} />
                    <strong>{t.title}</strong>
                  </span>
                </td>
                <td>{t.supplier}</td>
                <td>Día {t.day}</td>
                <td>
                  {t.amount_cents === null
                    ? "Variable · por definir"
                    : money(t.amount_cents)}
                </td>
                <td>
                  <span className={`badge ${t.active ? "green" : "gray"}`}>
                    {t.active ? "Activo" : "Pausado"}
                  </span>
                </td>
                <td>
                  {user.role === "owner" ? (
                    <button
                      className="icon-button"
                      disabled={busy}
                      aria-label={`${t.active ? "Pausar" : "Activar"} ${t.title}`}
                      onClick={() => onToggle(t)}
                    >
                      {t.active ? <Pause size={17} /> : <Play size={17} />}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="section-footer">
        <p>El día 31 se ajusta al último día en meses cortos.</p>
        <button
          className="button outline-green"
          onClick={onPrepare}
          disabled={busy}
        >
          {busy ? "Preparando…" : "Preparar el mes seleccionado"}
        </button>
      </div>
    </section>
  );
}
export function HistoryView({ items }: { items: Activity[] }) {
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Historial de actividad</h2>
        <span className="muted">Últimos 300 eventos</span>
      </div>
      <p className="section-description">
        Quién hizo cada cambio y cuándo. Horario de Lima, Perú.
      </p>
      <div className="history-list">
        {items.map((a) => (
          <article className="history-row" key={a.id}>
            <span className="history-dot" />
            <div>
              <strong>{a.action}</strong>
              <p>{a.detail}</p>
              <small>{a.actor || "Sistema"}</small>
            </div>
            <time>{dateTime(a.created_at)}</time>
          </article>
        ))}
      </div>
      {!items.length ? <Empty text="Sin movimientos registrados." /> : null}
    </section>
  );
}
