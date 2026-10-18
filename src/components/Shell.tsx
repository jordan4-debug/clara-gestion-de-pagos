import type { ReactNode } from 'react';
import {
  House,
  CreditCard,
  CalendarDays,
  Users,
  History,
  Settings,
  LogOut,
  ChevronRight,
} from 'lucide-react';
import { Brand } from './ui';
import type { User } from '../types';
export const nav = [
  { id: 'summary', label: 'Resumen', icon: House },
  { id: 'bills', label: 'Pagos', icon: CreditCard },
  { id: 'templates', label: 'Recurrentes', icon: CalendarDays },
  { id: 'suppliers', label: 'Proveedores', icon: Users },
  { id: 'history', label: 'Historial', icon: History },
  { id: 'settings', label: 'Configuración', icon: Settings },
];
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
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="mobile-session">
          <span className="avatar">{user.role === 'owner' ? 'PR' : 'AS'}</span>
          <button className="icon-button" aria-label="Cerrar sesión" onClick={onLogout}>
            <LogOut size={18} />
          </button>
        </div>
        <nav aria-label="Navegación principal">
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={page === id ? 'nav-link selected' : 'nav-link'}
              aria-current={page === id ? 'page' : undefined}
              onClick={() => onNavigate(id)}
            >
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="user-profile">
            <span className="avatar">{user.role === 'owner' ? 'PR' : 'AS'}</span>
            <span>
              {user.name}
              <small>{user.role === 'owner' ? 'Propietario' : 'Asistente'}</small>
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
        {nav.map(({ id, label, icon: Icon }) => (
          <button
            aria-current={page === id ? 'page' : undefined}
            className={page === id ? 'active' : ''}
            key={id}
            onClick={() => onNavigate(id)}
          >
            <Icon size={19} />
            <span>{label}</span>
          </button>
        ))}
      </footer>
    </div>
  );
}
