import { useState } from "react";
import {
  Search,
  ChevronRight,
  ArrowRight,
  Download,
  SlidersHorizontal,
} from "lucide-react";
import { Badge, BillIcon, Empty } from "../components/ui";
import { money, shortDate, exportBills } from "../lib/api";
import type { Bill } from "../types";
export function BillTable({
  bills,
  month,
  onSelect,
  onSeeAll,
  compact = false,
}: {
  bills: Bill[];
  month: string;
  onSelect: (id: number) => void;
  onSeeAll?: () => void;
  compact?: boolean;
}) {
  const [tab, setTab] = useState("all"),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("all");
  const pending = bills.filter((x) => x.status !== "Pagado");
  const paid = bills.filter((x) => x.status === "Pagado");
  const filtered = bills.filter(
    (b) =>
      (tab === "all" ||
        (tab === "overdue"
          ? b.status === "Vencido"
          : tab === "paid"
            ? b.status === "Pagado"
            : b.status !== "Pagado")) &&
      (category === "all" || b.category === category) &&
      `${b.title} ${b.supplier}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  return (
    <section className="panel payments-panel">
      <div className="panel-title">
        <h2>Deudas y pagos del mes</h2>
        {!compact ? (
          <button
            className="text-button"
            onClick={() => exportBills(filtered, month)}
          >
            <Download size={15} />
            Exportar CSV
          </button>
        ) : null}
      </div>
      <div className="tabs" role="tablist" aria-label="Estado de pagos">
        {[
          ["all", "Todos", bills.length],
          ["pending", "Pendientes", pending.length],
          ["paid", "Pagados", paid.length],
          [
            "overdue",
            "Vencidos",
            bills.filter((b) => b.status === "Vencido").length,
          ],
        ].map(([id, label, count]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(String(id))}
          >
            {label}
            <span>{count}</span>
          </button>
        ))}
      </div>
      <div className="table-filters">
        <label className="search">
          <Search size={17} />
          <input
            aria-label="Buscar pago o proveedor"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar un pago o proveedor"
          />
        </label>
        <label className="category-filter">
          <SlidersHorizontal size={15} />
          <select
            aria-label="Filtrar por categoría"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">Todas las categorías</option>
            {[
              "Servicios",
              "Proveedores",
              "Impuestos",
              "Alquiler",
              "Préstamos",
              "Otros",
            ].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Concepto</th>
              <th>Vencimiento</th>
              <th className="number">
                {compact ? "Monto" : "Monto / pendiente"}
              </th>
              <th>Estado</th>
              <th>
                <span className="sr-only">Detalle</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {(compact ? filtered.slice(0, 6) : filtered).map((b) => (
              <tr key={b.id}>
                <td>
                  <button
                    className="concept-button"
                    onClick={() => onSelect(b.id)}
                  >
                    <BillIcon title={b.title} category={b.category} />
                    <span>
                      <strong>{b.title}</strong>
                      <small>{b.supplier}</small>
                    </span>
                  </button>
                </td>
                <td
                  className={
                    b.status === "Vencido"
                      ? "overdue"
                      : b.due_soon
                        ? "due-soon"
                        : ""
                  }
                >
                  {shortDate(b.due_date)}
                </td>
                <td className="number">
                  {money(b.amount_cents)}
                  {!compact && b.paid_cents > 0 ? (
                    <small>Pendiente {money(b.remaining_cents)}</small>
                  ) : null}
                </td>
                <td>
                  <Badge status={b.status} />
                  {b.simulated ? (
                    <small className="review-count">Pago simulado</small>
                  ) : null}
                  {b.due_soon ? (
                    <span className="badge amber">Por vencer</span>
                  ) : null}
                  {!b.invoice_receipt_id ? (
                    <small className="review-count">
                      Falta recibo original
                    </small>
                  ) : null}
                  {b.invoice_receipt_id && !b.invoice_number ? (
                    <small className="review-count">
                      Falta número del recibo
                    </small>
                  ) : null}
                  {b.observed_reviews ? (
                    <small className="review-count observed">
                      {b.observed_reviews} comprobante observado
                    </small>
                  ) : b.pending_reviews ? (
                    <small className="review-count">
                      {b.pending_reviews} por revisar
                    </small>
                  ) : null}
                </td>
                <td>
                  <button
                    className="icon-button"
                    onClick={() => onSelect(b.id)}
                    aria-label={`Ver ${b.title}`}
                  >
                    <ChevronRight size={17} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filtered.length ? <Empty /> : null}
      {compact ? (
        <button className="panel-link" onClick={onSeeAll}>
          Ver todos los pagos
          <ArrowRight size={15} />
        </button>
      ) : (
        <div className="table-footer">
          {filtered.length} {filtered.length === 1 ? "pago" : "pagos"} · Montos
          expresados en soles (PEN)
        </div>
      )}
    </section>
  );
}
