import { TrendingUp } from "lucide-react";
import { money } from "../lib/api";
import type { Variation, VariationSummary } from "../types";

const reasons: Record<string, string> = {
  missing_reference: "Falta el código de suministro o contrato.",
  undefined_amount: "El importe todavía no está definido.",
  missing_original: "Falta el recibo original o su número.",
  no_previous: "No hay un periodo anterior registrado para este suministro.",
  ambiguous_period:
    "Hay varios recibos del mismo suministro en un periodo; requieren revisión individual.",
  incomplete_previous:
    "El recibo del periodo anterior no tiene importe u original completo.",
};
export function VariationComparison({
  entry,
  onSelect,
}: {
  entry: Variation;
  onSelect?: (id: number) => void;
}) {
  if (entry.status !== "compared")
    return (
      <p className="muted">
        Sin comparación:{" "}
        {reasons[entry.status] || "Falta información comparable."}
      </p>
    );
  const difference = entry.difference_cents || 0;
  return (
    <div className={`variation-comparison ${entry.alert ? "flagged" : ""}`}>
      <div className="variation-amounts">
        <span>
          Anterior · {entry.previous_month}
          <strong>{money(entry.previous_cents!)}</strong>
        </span>
        <span>
          Actual · {entry.month}
          <strong>{money(entry.current_cents)}</strong>
        </span>
        <span>
          {difference > 0
            ? "Aumento"
            : difference < 0
              ? "Disminución"
              : "Sin cambio"}
          <strong>
            {money(Math.abs(difference))} ·{" "}
            {Math.abs(entry.percent || 0).toLocaleString("es-PE", {
              maximumFractionDigits: 2,
            })}{" "}
            %
          </strong>
        </span>
      </div>
      <div className="button-row variation-actions">
        {onSelect && entry.previous_bill_id ? (
          <button
            type="button"
            className="button"
            onClick={() => onSelect(entry.previous_bill_id!)}
          >
            Ver periodo anterior
          </button>
        ) : null}
        {entry.previous_receipt_id ? (
          <a
            className="button"
            href={`/api/receipts/${entry.previous_receipt_id}`}
            target="_blank"
            rel="noreferrer"
          >
            Original anterior
          </a>
        ) : null}
        {entry.current_receipt_id ? (
          <a
            className="button"
            href={`/api/receipts/${entry.current_receipt_id}`}
            target="_blank"
            rel="noreferrer"
          >
            Original actual
          </a>
        ) : null}
      </div>
      <small className="muted">
        Se compara el importe de los recibos del mismo proveedor y suministro
        con el último periodo anterior disponible; no el efectivo entregado ni
        el importe de un abono.
      </small>
    </div>
  );
}
export function VariationAlerts({
  summary,
  onSelect,
  onConfigure,
}: {
  summary?: VariationSummary;
  onSelect: (id: number) => void;
  onConfigure?: () => void;
}) {
  if (!summary) return null;
  return (
    <section
      className="panel variation-panel"
      aria-label="Alertas de variación de importes"
    >
      <div className="section-head">
        <h2>
          <TrendingUp size={21} /> Alertas de variación{" "}
          <span className="variation-count">
            {summary.variation_enabled ? summary.alerts.length : "Desactivadas"}
          </span>
        </h2>
        {onConfigure ? (
          <button type="button" className="text-button" onClick={onConfigure}>
            Configurar avisos
          </button>
        ) : null}
      </div>
      {!summary.variation_enabled ? (
        <p className="muted">
          Los avisos de aumento están desactivados. Puedes activarlos desde Mi
          cuenta.
        </p>
      ) : (
        <>
          <p className="muted">
            Se destacan aumentos de al menos {summary.variation_percent} % y{" "}
            {money(summary.variation_min_cents)}. Comparados: {summary.compared}{" "}
            de {summary.total} recibos del mes, sin cuotas de préstamos.
          </p>
          {summary.alerts.length ? (
            <div className="variation-list">
              {summary.alerts.map((entry) => (
                <article key={entry.bill_id} className="variation-item">
                  <h3>{entry.title}</h3>
                  <p className="muted">
                    {entry.supplier} · Suministro / contrato:{" "}
                    {entry.service_reference}
                  </p>
                  <VariationComparison entry={entry} onSelect={onSelect} />
                  <button
                    type="button"
                    className="button outline-green"
                    onClick={() => onSelect(entry.bill_id)}
                  >
                    Revisar detalle y constancias
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <p>
              No se detectaron aumentos que alcancen el umbral entre los recibos
              comparables.
            </p>
          )}
          {summary.unavailable.length ? (
            <details className="variation-unavailable">
              <summary>
                {summary.unavailable.length} recibos sin base comparable
              </summary>
              <p className="muted">
                La falta de comparación no confirma que el importe sea correcto.
                En los nuevos recibos, registra el suministro y conserva el
                original.
              </p>
              <ul>
                {summary.unavailable.map((entry) => (
                  <li key={entry.bill_id}>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => onSelect(entry.bill_id)}
                    >
                      {entry.title} · {entry.supplier}
                    </button>
                    <small>{reasons[entry.status]}</small>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <p className="amount-note">
            Una variación requiere revisión; no demuestra una irregularidad. El
            gerente contrasta el original y las constancias. Estos avisos no
            bloquean ni autorizan pagos.
          </p>
        </>
      )}
    </section>
  );
}
