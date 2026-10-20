import { Plus, Banknote } from "lucide-react";
import { money } from "../lib/api";
import { BillTable } from "./BillTable";
import type { Dashboard, User } from "../types";
export function RoleOverview({
  data,
  user,
  onSelect,
  onNew,
}: {
  data: Dashboard;
  user: User;
  onSelect: (id: number) => void;
  onNew: () => void;
}) {
  const o = data.overview;
  const metrics =
    user.role === "owner"
      ? [
          ["Gastos pagados en el mes", money(o.paid_cents), "green"],
          ["Deudas por pagar", money(o.pending_cents), "amber"],
          ["Deuda vencida", money(o.overdue_cents), "red"],
          ["Recibos del mes", String(o.receipts), "blue"],
        ]
      : [
          ["Importe de los recibos", money(data.totals.total), "blue"],
          ["Abonado a estos recibos", money(data.totals.monthPaid), "green"],
          ["Falta pagar", money(o.pending_cents), "amber"],
          ["Recibos vencidos", String(o.overdue_count), "red"],
        ];
  return (
    <>
      <div className="monthly-intro">
        <p>
          {user.role === "owner"
            ? "Supervisa los gastos registrados, los vencimientos y el efectivo entregado al asistente."
            : "Registra recibos, consulta tus pendientes y archiva la constancia del pago realizado."}
        </p>
        {user.role === "assistant" ? (
          <button className="button primary" onClick={onNew}>
            <Plus size={19} />
            Registrar recibo
          </button>
        ) : null}
      </div>
      <BillTable
        bills={data.bills}
        allBills={data.all_bills}
        month={data.month}
        onSelect={onSelect}
      />
      <div className="role-metrics monthly-metrics">
        {metrics.map(([label, value, tone]) => (
          <div key={label} className={`role-metric ${tone}`}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="expense-summary-line">
        <span>
          <b>{o.paid_count}</b> recibos pagados
        </span>
        <span>
          <b>{o.pending_count}</b> por pagar, incluidos <b>{o.overdue_count}</b>{" "}
          vencidos
        </span>
      </div>
      {user.role === "owner" ? (
        <p className="amount-note">
          {o.change_cents == null
            ? "Sin datos del mes anterior para comparar gastos registrados."
            : `Comparación con ${o.previous_month}: ${money(o.previous_cents)} registrados; diferencia ${money(o.change_cents)}.`}{" "}
          Los gastos del mes se calculan por fecha de pago; las deudas, por su
          periodo.
        </p>
      ) : null}
      {data.totals.undefined ? (
        <p className="amount-note">
          Hay {data.totals.undefined} importes por definir que todavía no se
          suman.
        </p>
      ) : null}
      <div className="cash-summary-inline">
        <Banknote size={22} />
        <p>
          <strong>
            Efectivo físico ·{" "}
            {user.role === "owner"
              ? "Entregado al asistente"
              : "Recibido del gerente"}
            : {money(data.cash_summary.delivered)}
          </strong>
          <span>
            Utilizado {money(data.cash_summary.spent)} · Devuelto{" "}
            {money(data.cash_summary.returned)} · Por rendir{" "}
            {money(data.cash_summary.balance_cents)}
          </span>
          <small>
            Una entrega de efectivo no es un gasto ni marca recibos como
            pagados. El importe por rendir incluye periodos anteriores.
          </small>
        </p>
      </div>
      <p className="amount-note">
        Los pagos se registran con su constancia. Revisar un documento confirma
        la revisión administrativa, sin verificar movimientos bancarios.
      </p>
    </>
  );
}
