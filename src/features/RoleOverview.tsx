import { useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  FileCheck2,
  Clock3,
  ListTodo,
  CircleAlert,
  CalendarClock,
} from "lucide-react";
import { Badge, Empty } from "../components/ui";
import { money, shortDate, dateTime } from "../lib/api";
import type { Bill, Dashboard, Review, User } from "../types";

function WorkList({
  bills,
  onSelect,
  empty,
}: {
  bills: Bill[];
  onSelect: (id: number) => void;
  empty: string;
}) {
  return bills.length ? (
    <div className="work-list">
      {bills.slice(0, 6).map((b) => (
        <button className="work-row" key={b.id} onClick={() => onSelect(b.id)}>
          <span className="work-date">
            <strong>{b.due_date.slice(8)}</strong>
            <small>{shortDate(b.due_date).split(" ").slice(1).join(" ")}</small>
          </span>
          <span className="work-copy">
            <strong>{b.title}</strong>
            <small>{b.supplier}</small>
          </span>
          <span className="work-value">
            <strong>{money(b.remaining_cents)}</strong>
            <Badge status={b.status} />
          </span>
          <ArrowRight size={17} />
        </button>
      ))}
    </div>
  ) : (
    <Empty text={empty} />
  );
}
export function RoleOverview({
  data,
  reviews,
  user,
  onSelect,
  onNavigate,
  onPrepare,
  busy,
}: {
  data: Dashboard;
  reviews: Review[];
  user: User;
  onSelect: (id: number) => void;
  onNavigate: (id: string) => void;
  onPrepare: () => void;
  busy: boolean;
}) {
  const owner = user.role === "owner";
  const pending = data.bills.filter((b) => b.status !== "Pagado");
  const ready = pending.filter((b) => b.amount_cents !== null);
  const undefinedBills = pending.filter((b) => b.amount_cents === null);
  const overdue = pending.filter((b) => b.status === "Vencido");
  const observed = reviews.filter((p) => p.review_status === "observed");
  const unchecked = reviews.filter(
    (p) => !p.review_status || p.review_status === "pending",
  );
  const [filter, setFilter] = useState("ready");
  const taskBills =
    filter === "undefined"
      ? undefinedBills
      : filter === "waiting"
        ? overdue
        : ready;
  const cards = owner
    ? [
        {
          label: "Pagos próximos · 7 días",
          value: money(data.totals.week),
          hint: `${data.totals.weekUndefined} ${data.totals.weekUndefined === 1 ? "importe" : "importes"} por completar`,
          icon: CalendarClock,
          page: "bills",
          tone: "green",
        },
        {
          label: "Pagos vencidos",
          value: String(overdue.length),
          hint: "Revisar fechas y obligaciones",
          icon: CircleAlert,
          page: "bills",
          tone: "amber",
        },
        {
          label: "Comprobantes por revisar",
          value: String(unchecked.length),
          hint: "Abonos del mes seleccionado",
          icon: FileCheck2,
          page: "reviews",
          tone: "blue",
        },
        {
          label: "Pendiente por pagar",
          value: money(data.totals.pending),
          hint: `${pending.length} obligaciones abiertas`,
          icon: Clock3,
          page: "reports",
          tone: "gray",
        },
      ]
    : [
        {
          label: "Listos para pagar",
          value: String(ready.length),
          hint: "Con importe definido",
          icon: ListTodo,
          page: "bills",
          tone: "green",
        },
        {
          label: "Montos por completar",
          value: String(undefinedBills.length),
          hint: "Actualiza al recibir la factura",
          icon: CalendarDays,
          page: "bills",
          tone: "amber",
        },
        {
          label: "Comprobantes observados",
          value: String(observed.length),
          hint: "Corrige y vuelve a enviar",
          icon: CircleAlert,
          page: "reviews",
          tone: "red",
        },
        {
          label: "Pagos vencidos",
          value: String(overdue.length),
          hint: "Prioriza estas obligaciones",
          icon: CircleAlert,
          page: "bills",
          tone: "blue",
        },
      ];
  return (
    <>
      <div className="role-intro">
        <span className="eyebrow">
          {owner ? "SUPERVISIÓN Y SEGUIMIENTO" : "OPERACIÓN DIARIA"}
        </span>
        <p>
          {owner
            ? "Lo que necesita tu atención, antes de que el mes se complique."
            : "Primero lo urgente. Completa importes, registra abonos y atiende observaciones."}
        </p>
      </div>
      <div className="role-metrics">
        {cards.map((c, i) => (
          <button
            key={c.label}
            className={`role-metric ${c.tone}`}
            onClick={() => {
              if (!owner && i !== 2) {
                setFilter(["ready", "undefined", "", "waiting"][i]);
                document
                  .getElementById("task-queue")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              } else onNavigate(c.page);
            }}
          >
            <span className="role-metric-head">
              <c.icon size={20} />
              <ArrowRight size={15} />
            </span>
            <span>{c.label}</span>
            <strong>{c.value}</strong>
            <small>{c.hint}</small>
          </button>
        ))}
      </div>
      <div className="role-grid">
        <section className="panel workflow-panel" id="task-queue">
          <div className="panel-title">
            <h2>
              {owner ? "Pagos que necesitan atención" : "Tu bandeja de trabajo"}
            </h2>
            <button className="text-button" onClick={() => onNavigate("bills")}>
              Ver todos <ArrowRight size={15} />
            </button>
          </div>
          {!owner ? (
            <div className="queue-filters">
              {[
                ["ready", "Listos"],
                ["undefined", "Por completar"],
                ["waiting", "Vencidos"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={filter === id ? "active" : ""}
                  aria-pressed={filter === id}
                  onClick={() => setFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <p className="muted">
              Revisa los vencimientos cercanos y los importes que aún faltan
              completar.
            </p>
          )}
          <WorkList
            bills={owner ? pending : taskBills}
            onSelect={onSelect}
            empty={
              owner
                ? "No tienes pagos pendientes en este mes."
                : "No hay tareas en esta bandeja para el mes seleccionado."
            }
          />
        </section>
        <aside className="role-aside">
          <section className="panel priority-card">
            <span className="priority-icon">
              <FileCheck2 size={24} />
            </span>
            <h2>
              {owner
                ? "Cada abono, con respaldo"
                : "Observaciones por resolver"}
            </h2>
            <p>
              {owner
                ? `${unchecked.length} ${unchecked.length === 1 ? "constancia espera" : "constancias esperan"} tu revisión. Comprueba monto, destinatario y número de operación.`
                : `Tienes ${observed.length} ${observed.length === 1 ? "comprobante observado" : "comprobantes observados"}. Lee el comentario del propietario antes de corregir.`}
            </p>
            <button
              className="button outline-green full"
              onClick={() => onNavigate("reviews")}
            >
              {owner ? "Revisar comprobantes" : "Ir a mis comprobantes"}
              <ArrowRight size={15} />
            </button>
          </section>
          {!owner ? (
            <section className="prepare-panel task-prepare">
              <CalendarDays size={25} />
              <h2>Prepara el mes</h2>
              <p>
                Genera los gastos recurrentes una sola vez y completa lo que
                cambió.
              </p>
              <button
                className="button outline-green full"
                onClick={onPrepare}
                disabled={busy}
              >
                {busy ? "Preparando…" : "Preparar mes"}
              </button>
            </section>
          ) : null}
        </aside>
        <section className="panel workflow-panel">
          <div className="panel-title">
            <h2>
              {owner
                ? "Vencimientos que conviene anticipar"
                : "Próximos vencimientos"}
            </h2>
            <CalendarDays size={20} />
          </div>
          <WorkList
            bills={data.upcoming}
            onSelect={onSelect}
            empty="No quedan vencimientos pendientes."
          />
        </section>
        <section className="panel workflow-panel">
          <div className="panel-title">
            <h2>Últimos movimientos</h2>
            <button
              className="text-button"
              onClick={() => onNavigate("history")}
            >
              Ver historial
            </button>
          </div>
          <div className="compact-activity">
            {data.activity.slice(0, 4).map((a) => (
              <article key={a.id}>
                <strong>{a.action}</strong>
                <p>{a.detail}</p>
                <small>
                  {a.actor} · {dateTime(a.created_at)}
                </small>
              </article>
            ))}
          </div>
        </section>
      </div>
      <p className="amount-note">
        Los importes por definir no se incluyen en los totales. Los abonos
        registrados no confirman por sí solos una transferencia bancaria.
      </p>
    </>
  );
}
