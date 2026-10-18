import { useEffect, useState } from "react";
import { Download, BarChart3, RefreshCw } from "lucide-react";
import { Empty, FormError } from "../components/ui";
import { api, money, exportBills } from "../lib/api";
import type { Dashboard, Report } from "../types";
export function Reports({ data }: { data: Dashboard }) {
  const [report, setReport] = useState<Report | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    void api<Report>(`/reports?month=${data.month}`)
      .then((r) => {
        if (active) setReport(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [data, retry]);
  const visible = report?.month === data.month ? report : null;
  if (error)
    return (
      <div className="panel workflow-panel">
        <FormError message={error} />
        <button className="button" onClick={() => setRetry((n) => n + 1)}>
          <RefreshCw size={16} />
          Reintentar
        </button>
      </div>
    );
  if (!visible)
    return (
      <p className="muted" role="status">
        Preparando reporte…
      </p>
    );
  const max = Math.max(...visible.trend.map((t) => t.recorded), 1);
  return (
    <>
      <div className="report-heading">
        <p className="muted">
          Periodo {visible.month} · Montos en soles · Fechas de registro en
          horario de Lima.
        </p>
        <button
          className="button"
          onClick={() => exportBills(visible.bills, visible.month)}
        >
          <Download size={16} />
          Descargar obligaciones CSV
        </button>
      </div>
      <div className="role-metrics report-metrics">
        <div className="role-metric green">
          <span>Abonos registrados en el periodo</span>
          <strong>{money(visible.totals.paid)}</strong>
          <small>{visible.recorded_count} operaciones declaradas</small>
        </div>
        <div className="role-metric amber">
          <span>Saldo de obligaciones del mes</span>
          <strong>{money(visible.totals.pending)}</strong>
          <small>{visible.totals.undefined} importes aún por definir</small>
        </div>
        <div className="role-metric blue">
          <span>Constancias revisadas</span>
          <strong>
            {visible.verified_count} / {visible.recorded_count}
          </strong>
          <small>Abonos registrados en este periodo</small>
        </div>
      </div>
      <div className="report-grid">
        <section className="panel workflow-panel">
          <div className="panel-title">
            <h2>Abonos de los últimos seis meses</h2>
            <BarChart3 size={21} />
          </div>
          <p className="muted">
            Se agrupan por fecha de registro, aunque la obligación pertenezca a
            otro mes.
          </p>
          <div
            className="trend-chart"
            role="img"
            aria-label={visible.trend
              .map((t) => `${t.month}: ${money(t.recorded)}`)
              .join("; ")}
          >
            {visible.trend.map((t) => (
              <div className="trend-column" key={t.month}>
                <strong>{money(t.recorded)}</strong>
                <div className="trend-track">
                  <span
                    style={{
                      height: `${Math.max(2, (t.recorded / max) * 100)}%`,
                    }}
                  />
                </div>
                <small>
                  {new Intl.DateTimeFormat("es-PE", {
                    month: "short",
                    timeZone: "UTC",
                  }).format(new Date(t.month + "-15T12:00:00Z"))}
                  <br />
                  {t.month.slice(0, 4)}
                </small>
              </div>
            ))}
          </div>
        </section>
        <section className="panel workflow-panel">
          <div className="panel-title">
            <h2>Distribución por categoría</h2>
          </div>
          <div className="table-scroll">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Categoría</th>
                  <th>Obligaciones</th>
                  <th>Saldo del mes</th>
                  <th>Abonos del periodo</th>
                </tr>
              </thead>
              <tbody>
                {visible.categories.map((c) => (
                  <tr key={c.category}>
                    <th scope="row">{c.category}</th>
                    <td>{c.count}</td>
                    <td>{money(c.pending)}</td>
                    <td>{money(c.recorded)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      {!visible.recorded_count && !visible.bills.length ? (
        <Empty text="Este periodo todavía no tiene registros." />
      ) : null}
      <p className="amount-note">
        Este reporte resume registros del sistema; no es un estado de cuenta
        bancario. El CSV contiene las obligaciones del mes seleccionado.
      </p>
    </>
  );
}
