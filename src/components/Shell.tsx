import { type ReactNode } from "react";
import {
  House,
  Settings,
  LogOut,
  ChevronRight,
  Landmark,
  Banknote,
} from "lucide-react";
import { Brand } from "./ui";
import type { User } from "../types";
export const nav = [
  { id: "summary", label: "Deudas del mes", icon: House },
  { id: "cash", label: "Control de efectivo", icon: Banknote },
  { id: "settings", label: "Configuración", icon: Settings },
];
export function navigation(user: User) {
  return nav.map((item) => ({
    ...item,
    label:
      item.id === "summary" && user.role === "owner"
        ? "Resumen de gastos"
        : item.id === "settings" && user.role === "assistant"
          ? "Mi cuenta"
          : item.label,
  }));
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
  const items = navigation(user);
  const navigate = (id: string) => {
    onNavigate(id);
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="mobile-session">
          <span className="avatar">{user.role === "owner" ? "GE" : "AS"}</span>
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
              {user.role === "owner" ? "GE" : "AS"}
            </span>
            <span>
              {user.name}
              <small>{user.role === "owner" ? "Gerente" : "Asistente"}</small>
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
        {items.map(({ id, label, icon: Icon }) => (
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
      </footer>
    </div>
  );
}
