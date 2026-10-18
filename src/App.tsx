import { useEffect, useState, useCallback, useRef } from "react";
import {
  Plus,
  Bell,
  CalendarDays,
  X,
  ChevronRight,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { Shell, navigation } from "./components/Shell";
import { Login } from "./features/Access";
import { Metrics } from "./features/Overview";
import { RoleOverview, Approvals } from "./features/RoleOverview";
import { Reviews } from "./features/Reviews";
import { Reports } from "./features/Reports";
import { Team } from "./features/Team";
import { BillTable } from "./features/BillTable";
import { BillDetail } from "./features/BillDetail";
import { BillForm, SupplierForm, TemplateForm } from "./features/EntityForms";
import { Suppliers, Templates, HistoryView } from "./features/Management";
import { SettingsView } from "./features/SettingsView";
import { api, send, setCsrf, shortDate, ApiError } from "./lib/api";
import type {
  User,
  Dashboard,
  Supplier,
  Template,
  Activity,
  Settings,
  Attempt,
  Bill,
  Review,
} from "./types";
type Editor =
  | { type: "bill"; bill?: Bill }
  | { type: "supplier"; supplier?: Supplier }
  | { type: "template" };
export function App() {
  const [user, setUser] = useState<User | null>(null),
    [checking, setChecking] = useState(true),
    [demo, setDemo] = useState(false),
    [page, setPage] = useState("summary"),
    [month, setMonth] = useState(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Lima",
        year: "numeric",
        month: "2-digit",
      })
        .format(new Date())
        .slice(0, 7),
    ),
    [snapshot, setData] = useState<Dashboard | null>(null),
    [suppliers, setSuppliers] = useState<Supplier[]>([]),
    [templates, setTemplates] = useState<Template[]>([]),
    [activity, setActivity] = useState<Activity[]>([]),
    [settings, setSettings] = useState<Settings | null>(null),
    [attempts, setAttempts] = useState<Attempt[]>([]),
    [reviews, setReviews] = useState<Review[]>([]),
    [selected, setSelected] = useState<number | null>(null),
    [editor, setEditor] = useState<Editor | null>(null),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [notifications, setNotifications] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const requestVersion = useRef(0);
  const data = snapshot?.month === month ? snapshot : null;
  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 5500);
  }, []);
  useEffect(() => {
    void Promise.all([
      api<{ user: User; csrf: string }>("/auth/me")
        .then((x) => {
          setCsrf(x.csrf);
          setUser(x.user);
        })
        .catch(() => {}),
      api<{ demo: boolean }>("/public-config")
        .then((x) => setDemo(x.demo))
        .catch(() => {}),
    ]).finally(() => setChecking(false));
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);
  const refresh = useCallback(async () => {
    if (!user) return;
    const version = ++requestVersion.current;
    try {
      const [d, s, t, a, c, p, r] = await Promise.all([
        api<Dashboard>(`/dashboard?month=${month}`),
        api<Supplier[]>("/suppliers"),
        api<Template[]>("/templates"),
        api<Activity[]>("/activity"),
        api<Settings>("/settings"),
        user.role === "owner"
          ? api<Attempt[]>("/attempts")
          : Promise.resolve([]),
        api<Review[]>(`/reviews?month=${month}`),
      ]);
      if (version !== requestVersion.current) return;
      setData(d);
      setSuppliers(s);
      setTemplates(t);
      setActivity(a);
      setSettings(c);
      setAttempts(p);
      setReviews(r);
      setError("");
    } catch (e) {
      if (version !== requestVersion.current) return;
      if (e instanceof ApiError && e.status === 401) {
        setUser(null);
        setData(null);
        setCsrf("");
        setPage("summary");
        return;
      }
      if (version === requestVersion.current) setError((e as Error).message);
    }
  }, [user, month]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!user || selected !== null || editor) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 20000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [user, selected, editor, refresh]);
  async function prepare() {
    setBusy(true);
    try {
      const x = await send<{ created: number }>("/months/generate", { month });
      await refresh();
      notify(
        x.created
          ? `${x.created} pagos creados para ${month}.`
          : "Este mes ya está preparado. No se crearon duplicados.",
      );
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const onNavigate = (id: string) => {
    if (!user || !navigation(user).some((n) => n.id === id)) return;
    setPage(id);
    setNotifications(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const saved = (newMonth?: string) => {
    setEditor(null);
    if (newMonth && newMonth !== month) setMonth(newMonth);
    else void refresh();
    notify("Cambios guardados.");
  };
  if (checking)
    return (
      <div className="loading-screen">
        Clara<span>Cargando tu espacio…</span>
      </div>
    );
  if (!user) return <Login onLogin={setUser} demo={demo} />;
  const title =
    page === "summary"
      ? user.role === "owner"
        ? "Tu gestión, bajo control."
        : "Tu trabajo de hoy, en orden."
      : navigation(user).find((x) => x.id === page)?.label || "Pagos";
  const subtitle: Record<string, string> = {
    summary:
      user.role === "owner"
        ? "Supervisa el saldo, autoriza excepciones y revisa los respaldos."
        : "Una bandeja para avanzar, sin perder de vista los vencimientos.",
    bills: "Controla cada obligación, desde el pendiente hasta su comprobante.",
    templates: "Una lista que recuerda por ti, todos los meses.",
    suppliers: "Toda la información que necesitas para pagar bien.",
    history: "Cada movimiento queda registrado.",
    settings:
      user.role === "owner"
        ? "Tu manera de trabajar, tus reglas."
        : "Consulta tu acceso y administra tu contraseña.",
    approvals: "Decide qué puede continuar y qué debe esperar.",
    reviews:
      user.role === "owner"
        ? "Comprueba cada constancia y deja observaciones claras."
        : "Consulta el estado de tus constancias y atiende las observaciones.",
    reports:
      "Entiende cómo se distribuyen los gastos y los abonos registrados.",
    team: "Accesos individuales con responsabilidades claras.",
  };
  return (
    <Shell
      user={user}
      page={page}
      onNavigate={onNavigate}
      onLogout={() => {
        void send("/auth/logout", {})
          .then(() => {
            requestVersion.current++;
            setUser(null);
            setData(null);
            setPage("summary");
          })
          .catch((e) => notify(e.message));
      }}
    >
      <div className="topbar">
        <div className="topbar-left">
          <span className="workspace-role">
            {user.role === "owner" ? "Propietario" : "Asistente"}
          </span>
          {demo ? (
            <span className="demo-label">
              Demo compartida · Pagos reales desactivados
            </span>
          ) : (
            <span className="workspace-label">Mi espacio de trabajo</span>
          )}
        </div>
        <div className="topbar-right">
          <button
            className="icon-button sync-button"
            aria-label="Actualizar datos"
            onClick={() => void refresh()}
          >
            <RefreshCw size={18} />
          </button>
          <label className="month-control">
            <CalendarDays size={17} />
            <input
              type="month"
              aria-label="Mes de consulta"
              min="2020-01"
              max="2099-12"
              value={month}
              onChange={(e) => {
                if (e.target.value) setMonth(e.target.value);
              }}
            />
          </label>
          <button
            className="bell-button icon-button"
            aria-label={`Notificaciones: ${data?.notifications.length || 0}`}
            aria-expanded={notifications}
            onClick={() => setNotifications(!notifications)}
          >
            <Bell size={20} />
            {data?.notifications.length ? <i /> : null}
          </button>
        </div>
        {notifications ? (
          <div className="notification-popover">
            <div className="section-head">
              <h3>Vencimientos y avisos</h3>
              <button
                className="icon-button"
                aria-label="Cerrar notificaciones"
                onClick={() => setNotifications(false)}
              >
                <X size={17} />
              </button>
            </div>
            {data?.notifications.length ? (
              data.notifications.map((b) => (
                <button
                  key={b.id}
                  onClick={() => {
                    setSelected(b.id);
                    setNotifications(false);
                  }}
                >
                  <span>
                    <strong>{b.title}</strong>
                    <small>
                      {b.status} · {shortDate(b.due_date)}
                    </small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))
            ) : (
              <p className="muted">
                No hay avisos para tu rol con la anticipación configurada.
              </p>
            )}
            <small>Recordatorios dentro de la aplicación.</small>
          </div>
        ) : null}
      </div>
      <header className="page-header">
        <div>
          <h1>{title}</h1>
          <p>{subtitle[page]}</p>
        </div>
        {page === "bills" ? (
          <button
            className="button primary new-payment"
            onClick={() => setEditor({ type: "bill" })}
          >
            <Plus size={19} />
            Nuevo pago
          </button>
        ) : null}
      </header>
      {error ? (
        <div className="error-banner" role="alert">
          {error}
          <button className="button" onClick={() => void refresh()}>
            <RefreshCw size={15} />
            Reintentar
          </button>
        </div>
      ) : null}
      {!data && !error ? <p className="muted">Cargando pagos…</p> : null}
      {data && page === "summary" ? (
        <RoleOverview
          data={data}
          user={user}
          reviews={reviews}
          onSelect={setSelected}
          onNavigate={onNavigate}
          onPrepare={() => void prepare()}
          busy={busy}
        />
      ) : null}
      {data && page === "approvals" && user.role === "owner" ? (
        <Approvals data={data} onSelect={setSelected} />
      ) : null}
      {data && page === "reviews" ? (
        <Reviews
          items={reviews}
          user={user}
          onChanged={() => void refresh()}
          onSelect={setSelected}
          notify={notify}
        />
      ) : null}
      {data && page === "reports" && user.role === "owner" ? (
        <Reports data={data} />
      ) : null}
      {page === "team" && user.role === "owner" ? (
        <Team user={user} notify={notify} publicDemo={demo} />
      ) : null}
      {data && page === "bills" ? (
        <>
          <Metrics data={data} />
          <BillTable bills={data.bills} month={month} onSelect={setSelected} />
        </>
      ) : null}
      {page === "suppliers" ? (
        <Suppliers
          items={suppliers}
          user={user}
          onNew={() => setEditor({ type: "supplier" })}
          onEdit={(supplier) => setEditor({ type: "supplier", supplier })}
        />
      ) : null}
      {page === "templates" ? (
        <Templates
          items={templates}
          user={user}
          onNew={() => setEditor({ type: "template" })}
          busy={busy}
          onPrepare={() => void prepare()}
          onToggle={async (t) => {
            setBusy(true);
            try {
              await send(`/templates/${t.id}`, { active: !t.active }, "PATCH");
              await refresh();
              notify(t.active ? "Recurrente pausado." : "Recurrente activado.");
            } catch (e) {
              notify((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
      {page === "history" ? <HistoryView items={activity} /> : null}
      {page === "settings" && settings ? (
        <SettingsView
          settings={settings}
          user={user}
          attempts={attempts}
          onChanged={() => void refresh()}
          notify={notify}
        />
      ) : null}
      <p className="workspace-footer">
        Clara Gestión de Pagos · Montos en soles · Horario de Lima, Perú
      </p>
      {selected !== null && !editor ? (
        <BillDetail
          id={selected}
          user={user}
          onClose={() => setSelected(null)}
          onChanged={() => void refresh()}
          onEdit={(bill) => {
            setSelected(null);
            setEditor({ type: "bill", bill });
          }}
          notify={notify}
        />
      ) : null}
      {editor?.type === "bill" ? (
        <BillForm
          suppliers={suppliers}
          month={month}
          bill={editor.bill}
          onClose={() => setEditor(null)}
          onSaved={saved}
        />
      ) : null}
      {editor?.type === "supplier" ? (
        <SupplierForm
          supplier={editor.supplier}
          onClose={() => setEditor(null)}
          onSaved={saved}
        />
      ) : null}
      {editor?.type === "template" ? (
        <TemplateForm
          suppliers={suppliers}
          onClose={() => setEditor(null)}
          onSaved={saved}
        />
      ) : null}
      {toast ? (
        <div role="status" className="toast">
          <CheckCircle2 size={19} />
          {toast}
          <button aria-label="Cerrar aviso" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      ) : null}
    </Shell>
  );
}
