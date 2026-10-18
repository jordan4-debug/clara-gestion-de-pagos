import { useState, type ReactNode } from "react";
import {
  House,
  CreditCard,
  CalendarDays,
  Users,
  History,
  Settings,
  LogOut,
  ChevronRight,
  ShieldCheck,
  FileCheck2,
  BarChart3,
  Menu,
} from "lucide-react";
import { Brand } from "./ui";
import type { User } from "../types";
export const nav = [
  { id: "summary", label: "Resumen", icon: House },
  { id: "bills", label: "Pagos", icon: CreditCard },
  { id: "templates", label: "Recurrentes", icon: CalendarDays },
  { id: "suppliers", label: "Proveedores", icon: Users },
  { id: "history", label: "Historial", icon: History },
  { id: "settings", label: "Configuración", icon: Settings },
  { id: "approvals", label: "Autorizaciones", icon: ShieldCheck },
  { id: "reviews", label: "Comprobantes", icon: FileCheck2 },
  { id: "reports", label: "Reportes", icon: BarChart3 },
  { id: "team", label: "Equipo", icon: Users },
];
export function navigation(user: User) {
  const ids =
    user.role === "owner"
      ? [
          "summary",
          "approvals",
          "reviews",
          "bills",
          "reports",
          "suppliers",
          "templates",
          "history",
          "team",
          "settings",
        ]
      : [
          "summary",
          "bills",
          "reviews",
          "templates",
          "suppliers",
          "history",
          "settings",
        ];
  return ids.map((id) => {
    const item = nav.find((n) => n.id === id)!;
    return {
      ...item,
      label:
        id === "summary"
          ? user.role === "owner"
            ? "Panel de control"
            : "Mis tareas"
          : id === "reviews" && user.role === "assistant"
            ? "Mis comprobantes"
            : id === "settings" && user.role === "assistant"
              ? "Mi cuenta"
              : item.label,
    };
  });
}
export function Shell({
  user,
  page,
  onNavigate,
  onLogout,
  children,
}: {
  user: User;
  page: string;
  onNavigate: (id: string) => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  const [menu, setMenu] = useState(false);
  const items = navigation(user);
  const mobileIds =
    user.role === "owner"
      ? ["summary", "approvals", "reviews", "reports"]
      : ["summary", "bills", "reviews", "history"];
  const navigate = (id: string) => {
    setMenu(false);
    onNavigate(id);
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="mobile-session">
          <span className="avatar">{user.role === "owner" ? "PR" : "AS"}</span>
          <button
            className="icon-button"
            aria-label="Cerrar sesión"
            onClick={onLogout}
          >
            <LogOut size={18} />
          </button>
        </div>
        <nav aria-label="Navegación principal">
          {items.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={page === id ? "nav-link selected" : "nav-link"}
              aria-current={page === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="user-profile">
            <span className="avatar">
              {user.role === "owner" ? "PR" : "AS"}
            </span>
            <span>
              {user.name}
              <small>
                {user.role === "owner" ? "Propietario" : "Asistente"}
              </small>
            </span>
            <ChevronRight size={16} />
          </div>
          <button className="logout" onClick={onLogout}>
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
      <footer className="mobile-nav">
        {items
          .filter((n) => mobileIds.includes(n.id))
          .map(({ id, label, icon: Icon }) => (
            <button
              aria-current={page === id ? "page" : undefined}
              className={page === id ? "active" : ""}
              key={id}
              onClick={() => navigate(id)}
            >
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}
        <button
          onClick={() => setMenu(!menu)}
          aria-expanded={menu}
          aria-controls="mobile-more-menu"
        >
          <Menu size={19} />
          <span>Más</span>
        </button>
      </footer>
      {menu ? (
        <nav
          id="mobile-more-menu"
          className="mobile-more-menu"
          aria-label="Más opciones"
        >
          {items
            .filter((n) => !mobileIds.includes(n.id))
            .map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => navigate(id)}>
                <Icon size={18} />
                {label}
              </button>
            ))}
        </nav>
      ) : null}
    </div>
  );
}
