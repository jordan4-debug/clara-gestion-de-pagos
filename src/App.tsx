import { useEffect, useState, useCallback, useRef } from "react";
import {
  Bell,
  CalendarDays,
  X,
  ChevronRight,
  CheckCircle2,
  RefreshCw,
  ChevronLeft,
} from "lucide-react";
import { Shell, navigation } from "./components/Shell";
import { Login } from "./features/Access";
import { RoleOverview } from "./features/RoleOverview";
import { Cash } from "./features/Cash";
import { Loans } from "./features/Loans";

import { Modal, FormError } from "./components/ui";
import { Team } from "./features/Team";
import { BillDetail } from "./features/BillDetail";
import { BillForm, SupplierForm } from "./features/EntityForms";
import { Suppliers } from "./features/Management";
import { SettingsView } from "./features/SettingsView";
import { api, send, setCsrf, shortDate, ApiError } from "./lib/api";
import type { User, Dashboard, Supplier, Settings, Bill } from "./types";
type Editor =
  | { type: "bill"; bill?: Bill }
  | { type: "supplier"; supplier?: Supplier };
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
    [settings, setSettings] = useState<Settings | null>(null),
    [selected, setSelected] = useState<number | null>(null),
    [editor, setEditor] = useState<Editor | null>(null),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [notifications, setNotifications] = useState(false),
    [logoutPrompt, setLogoutPrompt] = useState(false),
    [logoutBusy, setLogoutBusy] = useState(false),
    [logoutError, setLogoutError] = useState(""),
    [loginNotice, setLoginNotice] = useState("");
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
      const [d, s, c] = await Promise.all([
        api<Dashboard>(`/dashboard?month=${month}`),
        api<Supplier[]>("/suppliers"),
        api<Settings>("/settings"),
      ]);
      if (version !== requestVersion.current) return;
      setData(d);
      setSuppliers(s);
      setSettings(c);
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
  function changeMonth(step: number) {
    const [year, m] = month.split("-").map(Number);
    const next = new Date(Date.UTC(year, m - 1 + step, 1))
      .toISOString()
      .slice(0, 7);
    if (next >= "2020-01" && next <= "2099-12") setMonth(next);
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
  async function logout() {
    setLogoutBusy(true);
    setLogoutError("");
    try {
      await send("/auth/logout", {});
      requestVersion.current++;
      setUser(null);
      setData(null);
      setCsrf("");
      setPage("summary");
      setLogoutPrompt(false);
      setLoginNotice("Sesión cerrada correctamente.");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setUser(null);
        setData(null);
        setLogoutPrompt(false);
        setLoginNotice("Tu sesión ya estaba cerrada.");
      } else setLogoutError((e as Error).message);
    } finally {
      setLogoutBusy(false);
    }
  }
  if (checking)
    return (
      <div className="loading-screen">
        Clara<span>Cargando tu espacio…</span>
      </div>
    );
  if (!user)
    return (
      <Login
        onLogin={(u) => {
          setLoginNotice("");
          setUser(u);
        }}
        notice={loginNotice}
      />
    );
  const title =
    page === "summary"
      ? "Deudas del mes"
      : navigation(user).find((x) => x.id === page)?.label || "Pagos";
  const subtitle: Record<string, string> = {
    summary:
      user.role === "owner"
        ? "Revisa tus obligaciones, sus recibos y lo que falta pagar."
        : "Registra recibos y pagos desde la lista mensual.",
    bills: "Controla cada obligación, desde el pendiente hasta su comprobante.",
    templates: "Una lista que recuerda por ti, todos los meses.",
    suppliers: "Toda la información que necesitas para pagar bien.",
    history: "Cada movimiento queda registrado.",
    settings:
      user.role === "owner"
        ? "Tu manera de trabajar, tus reglas."
        : "Consulta tu acceso y administra tu contraseña.",
    cash: "Entregas, pagos y devoluciones con su respaldo.",
    loans:
      "Organiza contratos y cuotas sin modificar los importes registrados.",
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
        setLogoutError("");
        setLogoutPrompt(true);
      }}
    >
      <div className="topbar">
        <div className="topbar-left">
          <span className="workspace-role">
            {user.role === "owner" ? "Gerente" : "Asistente"}
          </span>
          {demo ? (
            <span className="demo-label">Demostración · Datos ficticios</span>
          ) : (
            <span className="workspace-label">Control de gastos</span>
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
          <button
            className="icon-button month-step"
            aria-label="Mes anterior"
            disabled={month === "2020-01"}
            onClick={() => changeMonth(-1)}
          >
            <ChevronLeft size={21} />
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
            className="icon-button month-step"
            aria-label="Mes siguiente"
            disabled={month === "2099-12"}
            onClick={() => changeMonth(1)}
          >
            <ChevronRight size={21} />
          </button>
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
          onSelect={setSelected}
          onNew={() => setEditor({ type: "bill" })}
          onConfigureAlerts={() => onNavigate("settings")}
        />
      ) : null}
      {data && page === "loans" ? (
        <Loans
          suppliers={suppliers}
          user={user}
          version={data}
          onSupplierCreated={(supplier) =>
            setSuppliers((previous) => [
              ...previous.filter((s) => s.id !== supplier.id),
              supplier,
            ])
          }
          onChanged={() => void refresh()}
          onSelect={setSelected}
        />
      ) : null}
      {page === "cash" ? (
        <Cash
          user={user}
          month={month}
          refreshKey={snapshot}
          onChanged={() => void refresh()}
        />
      ) : null}
      {page === "settings" && settings ? (
        <>
          <SettingsView
            settings={settings}
            user={user}
            onChanged={() => void refresh()}
            notify={notify}
          />
          {user.role === "owner" ? (
            <>
              <details className="panel settings-disclosure">
                <summary>Servicios y proveedores</summary>
                <p className="muted">
                  Administra las entidades y el formato de sus recibos. No se
                  solicitan datos bancarios.
                </p>
                <Suppliers
                  items={suppliers}
                  user={user}
                  onNew={() => setEditor({ type: "supplier" })}
                  onEdit={(supplier) =>
                    setEditor({ type: "supplier", supplier })
                  }
                />
              </details>
              <details className="panel settings-disclosure">
                <summary>Equipo y accesos</summary>
                <Team user={user} notify={notify} publicDemo={demo} />
              </details>
            </>
          ) : null}
        </>
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
          onSelectRelated={setSelected}
        />
      ) : null}
      {editor?.type === "bill" && user.role === "assistant" ? (
        <BillForm
          suppliers={suppliers}
          month={month}
          bill={editor.bill}
          onSupplierCreated={(supplier) =>
            setSuppliers((previous) => [
              ...previous.filter((s) => s.id !== supplier.id),
              supplier,
            ])
          }
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

      {logoutPrompt ? (
        <Modal
          title="¿Cerrar sesión?"
          onClose={() => {
            if (!logoutBusy) setLogoutPrompt(false);
          }}
        >
          <div className="form-body">
            <p>
              Tu trabajo guardado se conservará. Tendrás que iniciar sesión para
              volver a entrar.
            </p>
            <FormError message={logoutError} />
            <div className="form-actions">
              <button
                className="button"
                disabled={logoutBusy}
                onClick={() => setLogoutPrompt(false)}
              >
                Cancelar
              </button>
              <button
                className="button primary"
                disabled={logoutBusy}
                onClick={() => void logout()}
              >
                {logoutBusy ? "Cerrando…" : "Sí, cerrar sesión"}
              </button>
            </div>
          </div>
        </Modal>
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
