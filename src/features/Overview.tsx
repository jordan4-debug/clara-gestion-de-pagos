import {
  Clock3,
  CalendarDays,
  Check,
  Ellipsis,
  ArrowRight,
  FileText,
  CheckCircle2,
} from 'lucide-react';
import { BillTable } from './BillTable';
import { Badge } from '../components/ui';
import { money, dateTime } from '../lib/api';
import type { Dashboard } from '../types';
export function Metrics({ data }: { data: Dashboard }) {
  const t = data.totals;
  const items = [
    { label: 'Pendiente por pagar', value: money(t.pending), icon: Clock3, color: 'amber' },
    { label: 'Próximos 7 días', value: money(t.week), icon: CalendarDays, color: 'blue' },
    { label: 'Pagado este mes', value: money(t.paid), icon: Check, color: 'green' },
    { label: 'Por definir', value: `${t.undefined} pagos`, icon: Ellipsis, color: 'gray' },
  ];
  return (
    <>
      <div className="metrics">
        {items.map(({ label, value, icon: Icon, color }) => (
          <div className="metric" key={label}>
            <span className={`metric-icon ${color}`}>
              <Icon size={22} />
            </span>
            <div>
              <p>{label}</p>
              <strong>{value}</strong>
            </div>
          </div>
        ))}
      </div>
      {t.undefined || t.weekUndefined ? (
        <p className="amount-note">
          Los totales incluyen montos definidos. {t.undefined} por definir en este mes
          {t.weekUndefined ? ` · ${t.weekUndefined} en los próximos 7 días` : ''}.
        </p>
      ) : null}
    </>
  );
}
export function Overview({
  data,
  onSelect,
  onNavigate,
  onPrepare,
  busy,
}: {
  data: Dashboard;
  onSelect: (id: number) => void;
  onNavigate: (page: string) => void;
  onPrepare: () => void;
  busy: boolean;
}) {
  return (
    <>
      <Metrics data={data} />
      <div className="overview-grid">
        <BillTable
          bills={data.bills}
          month={data.month}
          onSelect={onSelect}
          compact
          onSeeAll={() => onNavigate('bills')}
        />
        <aside className="right-rail">
          <section className="prepare-panel">
            <span className="prepare-icon">
              <CalendarDays size={30} />
            </span>
            <div>
              <h2>Tu mes, listo en un clic</h2>
              <p>
                Genera tus gastos recurrentes.
                <br />
                Solo actualiza lo que cambió.
              </p>
              <button className="button outline-green full" disabled={busy} onClick={onPrepare}>
                {busy ? 'Preparando…' : 'Preparar mes'}
              </button>
            </div>
          </section>
          <section className="panel upcoming">
            <div className="panel-title">
              <h2>Próximos vencimientos</h2>
              <button className="text-button" onClick={() => onNavigate('bills')}>
                Ver agenda
                <ArrowRight size={14} />
              </button>
            </div>
            {data.upcoming.length ? (
              data.upcoming.slice(0, 3).map((b) => (
                <button className="upcoming-row" key={b.id} onClick={() => onSelect(b.id)}>
                  <span className="date-square">
                    <small>
                      {new Intl.DateTimeFormat('es-PE', { month: 'short', timeZone: 'UTC' })
                        .format(new Date(b.due_date + 'T12:00:00Z'))
                        .replace('.', '')
                        .toUpperCase()}
                    </small>
                    <strong>{Number(b.due_date.slice(8))}</strong>
                  </span>
                  <span className="upcoming-copy">
                    <strong>{b.title}</strong>
                    <small>{b.supplier}</small>
                  </span>
                  <span className="upcoming-amount">
                    <strong>{money(b.remaining_cents)}</strong>
                    <Badge status={b.status} />
                  </span>
                </button>
              ))
            ) : (
              <p className="empty-inline">No tienes pagos pendientes.</p>
            )}
          </section>
          <section className="panel activity-panel">
            <div className="panel-title">
              <h2>Actividad reciente</h2>
              <button className="text-button" onClick={() => onNavigate('history')}>
                Ver todo
                <ArrowRight size={14} />
              </button>
            </div>
            <div className="activity-content">
              <div className="activity-list">
                {data.activity.slice(0, 4).map((a) => (
                  <div className="activity-row" key={a.id}>
                    <CheckCircle2 size={18} />
                    <div>
                      <strong>{a.action}</strong>
                      <p>{a.detail}</p>
                    </div>
                    <time>{dateTime(a.created_at)}</time>
                  </div>
                ))}
              </div>
              <div className="receipt-promo">
                <span>
                  <FileText size={27} />
                </span>
                <div>
                  <strong>Un espacio para cada comprobante</strong>
                  <p>Adjunta, organiza y consulta tus vouchers cuando los necesites.</p>
                </div>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
