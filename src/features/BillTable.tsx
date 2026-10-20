import { selectExpenses } from "../../shared/expenses.mjs";
import { useState } from "react";
import {
  Search,
  ChevronRight,
  ArrowRight,
  Download,
  SlidersHorizontal,
} from "lucide-react";
import { Badge, BillIcon, Empty, FormError } from "../components/ui";
import { money, shortDate, exportBills } from "../lib/api";
import type { Bill } from "../types";
export function BillTable({
  bills,
  allBills,
  month,
  onSelect,
  onSeeAll,
  compact = false,
}: {
  bills: Bill[];
  allBills?: Bill[];
  month: string;
  onSelect: (id: number) => void;
  onSeeAll?: () => void;
  compact?: boolean;
}) {
  const [tab, setTab] = useState("month"),
    [query, setQuery] = useState(""),
    [includeFuture, setIncludeFuture] = useState(false),
    [exporting, setExporting] = useState(false),
    [exportError, setExportError] = useState(""),
    [category, setCategory] = useState("all");
  const available = allBills || bills;
  const tabs = [
    ["month", "Pendientes"],
    ["overdue", "Vencidos"],
    ["paid", "Pagados"],
  ];
  const scope = { month, category, query, includeFuture };
  const filtered = selectExpenses(available, { ...scope, tab }) as Bill[];
  const visibleTotal = filtered.reduce(
    (sum, b) => sum + (b.amount_cents || 0),
    0,
  );
  const visiblePending = filtered.reduce(
    (sum, b) => sum + (b.remaining_cents || 0),
    0,
  );
  return (
    <section className="panel payments-panel">
      <div className="panel-title">
        <h2>
          {tab === "paid"
            ? "Pagos realizados"
            : tab === "overdue"
              ? "Deudas vencidas"
              : "Deudas pendientes"}
        </h2>
        {!compact ? (
          <div className="button-row report-export-actions">
            <button
              className="text-button"
              disabled={exporting}
              onClick={async () => {
                setExporting(true);
                setExportError("");
                try {
                  const { downloadPaymentSummary } =
                    await import("../lib/payment-summary");
                  await downloadPaymentSummary(
                    available.filter((b) => b.month === month),
                    month,
                  );
                } catch (e) {
                  setExportError(
                    (e as Error).message || "No se pudo generar el PDF.",
                  );
                } finally {
                  setExporting(false);
                }
              }}
            >
              <Download size={15} />
              {exporting ? "Generando PDF…" : "Resumen PDF"}
            </button>
            <button
              className="text-button"
              onClick={() => exportBills(filtered, month)}
            >
              <Download size={15} />
              Exportar CSV
            </button>
          </div>
        ) : null}
      </div>
      <FormError message={exportError} />
      <div className="tabs" role="tablist" aria-label="Estado de pagos">
        {tabs.map(([id, label]) => {
          const count = selectExpenses(available, { ...scope, tab: id }).length;
          return (
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
          );
        })}
      </div>
      <p className="expense-filter-hint">
        {tab === "month"
          ? includeFuture
            ? `Deudas sin liquidar desde ${month}, incluidas las cuotas y obligaciones de los meses siguientes.`
            : "Lo que falta pagar en el mes seleccionado. Los recibos cancelados se consultan en Pagados."
          : tab === "overdue"
            ? "Recibos del mes que siguen sin liquidar después de su fecha de vencimiento."
            : "Recibos del mes completamente pagados, con acceso a sus constancias."}
      </p>
      {tab === "month" ? (
        <label className="checkbox-line upcoming-toggle">
          <input
            type="checkbox"
            checked={includeFuture}
            onChange={(e) => setIncludeFuture(e.target.checked)}
          />
          Incluir deudas de los próximos meses
        </label>
      ) : null}
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
              {!compact ? <th>Fecha de pago</th> : null}
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
                      <small>
                        {b.supplier} · {b.month}
                      </small>
                      {b.invoice_number ? (
                        <small>Recibo {b.invoice_number}</small>
                      ) : null}
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
                {!compact ? (
                  <td>
                    {b.last_payment_date
                      ? shortDate(b.last_payment_date)
                      : "Sin pago registrado"}
                  </td>
                ) : null}
                <td className="number">
                  {money(b.amount_cents)}
                  {!compact && b.paid_cents > 0 ? (
                    <small>Pendiente {money(b.remaining_cents)}</small>
                  ) : null}
                </td>
                <td>
                  <Badge status={b.status} />
                  {b.simulated ? (
                    <small className="review-count">
                      Registro histórico de demostración
                    </small>
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
      {!filtered.length ? (
        <Empty
          text={
            tab === "month"
              ? "No hay deudas por pagar en este mes con los filtros elegidos. Consulta los pagos realizados en Pagados."
              : "No hay recibos que coincidan con el periodo y los filtros. Cambia el mes o limpia la búsqueda."
          }
        />
      ) : null}
      {compact ? (
        <button className="panel-link" onClick={onSeeAll}>
          Ver pendientes del mes
          <ArrowRight size={15} />
        </button>
      ) : (
        <div className="table-footer">
          {filtered.length} {filtered.length === 1 ? "pago" : "pagos"} · Montos
          expresados en soles (PEN).{" "}
          {tab === "month" && includeFuture
            ? "Desde " + month + ": deudas actuales y próximas"
            : "Periodo " + month}
          . Importe {money(visibleTotal)} · Falta pagar {money(visiblePending)}
        </div>
      )}
    </section>
  );
}
