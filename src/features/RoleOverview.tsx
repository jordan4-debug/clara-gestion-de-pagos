import { useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  ShieldCheck,
  FileCheck2,
  Clock3,
  ListTodo,
  CircleAlert,
  Wallet,
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
export function Approvals({
  data,
  onSelect,
}: {
  data: Dashboard;
  onSelect: (id: number) => void;
}) {
  const [filter, setFilter] = useState("required");
  const bills = data.bills.filter(
    (b) => b.approval === filter && b.status !== "Pagado",
  );
  return (
    <section className="panel workflow-panel">
      <div className="panel-title">
        <h2>Decisiones pendientes</h2>
        <ShieldCheck size={22} />
      </div>
      <p className="muted">
        Revisa el importe, proveedor y destino antes de autorizar. Los pagos
        habituales que cumplen tus reglas siguen disponibles para el asistente.
      </p>
      <div className="queue-filters">
        {[
          ["required", "Por autorizar"],
          ["blocked", "Detenidos"],
        ].map(([id, label]) => (
          <button
            className={filter === id ? "active" : ""}
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
            key={id}
          >
            {label}
            <span>
              {
                data.bills.filter(
                  (b) => b.approval === id && b.status !== "Pagado",
                ).length
              }
            </span>
          </button>
        ))}
      </div>
      <WorkList
        bills={bills}
        onSelect={onSelect}
        empty="No hay decisiones pendientes en este estado."
      />
    </section>
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
  const ready = pending.filter(
    (b) => b.approval === "approved" && b.amount_cents !== null,
  );
  const undefinedBills = pending.filter((b) => b.amount_cents === null);
  const authorizations = pending.filter((b) => b.approval === "required");
  const observed = reviews.filter((p) => p.review_status === "observed");
  const unchecked = reviews.filter(
    (p) => !p.review_status || p.review_status === "pending",
  );
  const [filter, setFilter] = useState("ready");
  const taskBills =
    filter === "undefined"
      ? undefinedBills
      : filter === "waiting"
        ? pending.filter((b) => b.approval !== "approved")
        : ready;
  const cards = owner
    ? [
        {
          label: "Saldo necesario · 7 días",
          value: money(data.totals.week),
          hint: `${data.totals.weekUndefined} importes por completar`,
          icon: Wallet,
          page: "bills",
          tone: "green",
        },
        {
          label: "Por autorizar",
          value: String(authorizations.length),
          hint: "Decisiones que dependen de ti",
          icon: ShieldCheck,
          page: "approvals",
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
          label: "Saldo pendiente del mes",
          value: money(data.totals.pending),
          hint: `${pending.length} obligaciones abiertas`,
          icon: Clock3,
          page: "reports",
          tone: "gray",
        },
      ]
    : [
        {
          label: "Listos para registrar",
          value: String(ready.length),
          hint: "Con monto y autorización",
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
          label: "Esperando autorización",
          value: String(authorizations.length),
          hint: "El propietario debe revisarlos",
          icon: ShieldCheck,
          page: "bills",
          tone: "blue",
        },
      ];
  return (
    <>
      <div className="role-intro">
        <span className="eyebrow">
          {owner ? "SUPERVISIÓN Y CONTROL" : "OPERACIÓN DIARIA"}
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
              {owner
                ? "Pendientes de tu autorización"
                : "Tu bandeja de trabajo"}
            </h2>
            <button
              className="text-button"
              onClick={() => onNavigate(owner ? "approvals" : "bills")}
            >
              Ver todos <ArrowRight size={15} />
            </button>
          </div>
          {!owner ? (
            <div className="queue-filters">
              {[
                ["ready", "Listos"],
                ["undefined", "Por completar"],
                ["waiting", "En espera"],
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
              El asistente puede continuar cuando autorices estas excepciones.
            </p>
          )}
          <WorkList
            bills={owner ? authorizations : taskBills}
            onSelect={onSelect}
            empty={
              owner
                ? "No tienes autorizaciones pendientes."
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
