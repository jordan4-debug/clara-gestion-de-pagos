import { FinanceOverview } from "./FinanceOverview";
import { Plus, Landmark, FileCheck2 } from "lucide-react";
import { money } from "../lib/api";
import { BillTable } from "./BillTable";
import type { Dashboard, User } from "../types";
export function RoleOverview({
  data,
  user,
  onSelect,
  onNavigate,
  onNew,
  onChanged,
}: {
  data: Dashboard;
  user: User;
  onSelect: (id: number) => void;
  onNavigate: (id: string) => void;
  onNew: () => void;
  onChanged: () => void;
}) {
  const count = data.bills.filter((b) => b.status === "Vencido").length;
  const metrics = [
    {
      label: "Total de obligaciones del mes",
      value: money(data.totals.total),
      tone: "blue",
    },
    {
      label: "Pagado de estas obligaciones",
      value: money(data.totals.monthPaid),
      tone: "green",
    },
    {
      label: "Pendiente del mes",
      value: money(data.totals.pending),
      tone: "amber",
    },
    { label: "Deudas vencidas", value: String(count), tone: "gray" },
  ];
  return (
    <>
      {user.role === "owner" ? (
        <FinanceOverview finance={data.finance} onChanged={onChanged} />
      ) : null}
      <div className="monthly-intro">
        <p>
          {user.role === "owner"
            ? "Consulta tus deudas, compara el recibo con su constancia y sigue lo que falta pagar."
            : "Registra los recibos, revisa sus vencimientos y guarda la constancia de cada pago."}
        </p>
        {user.role === "assistant" ? (
          <div className="button-row">
            <button className="button primary" onClick={onNew}>
              <Plus size={19} />
              Registrar recibo
            </button>
            <button className="button" onClick={() => onNavigate("loans")}>
              <Landmark size={18} />
              Ver préstamos
            </button>
          </div>
        ) : null}
      </div>
      <div
        className={
          user.role === "owner"
            ? "obligation-summary"
            : "role-metrics monthly-metrics"
        }
      >
        {metrics.map((m) => (
          <div key={m.label} className={`role-metric ${m.tone}`}>
            <span>{m.label}</span>
            <strong>{m.value}</strong>
          </div>
        ))}
      </div>
      {data.totals.undefined ? (
        <p className="amount-note">
          Hay {data.totals.undefined} importes por definir; todavía no se
          incluyen en los totales.
        </p>
      ) : null}
      {user.role === "assistant" ? (
        <section className="quick-payments" aria-label="Pagos rápidos">
          <h2>Pagos rápidos del mes</h2>
          <p className="muted">
            Datos del destinatario precargados. Abre la deuda, revisa su recibo
            y confirma el importe fijo.
          </p>
          <div className="quick-payment-buttons">
            {data.bills
              .filter(
                (b) =>
                  b.status !== "Pagado" &&
                  ["Servicios", "Impuestos"].includes(b.category),
              )
              .filter(
                (b, i, all) =>
                  all.findIndex((x) => x.supplier_id === b.supplier_id) === i,
              )
              .slice(0, 4)
              .map((b) => (
                <button
                  className="button"
                  key={b.id}
                  onClick={() => onSelect(b.id)}
                >
                  {b.title} · {b.supplier}
                </button>
              ))}
          </div>
        </section>
      ) : null}
      <BillTable bills={data.bills} month={data.month} onSelect={onSelect} />
      <p className="amount-note">
        <FileCheck2 size={16} />
        Abre una deuda para ver su recibo original y sus comprobantes. Los pagos
        registrados aquí son declarados; la conexión bancaria está pendiente.
      </p>
    </>
  );
}
