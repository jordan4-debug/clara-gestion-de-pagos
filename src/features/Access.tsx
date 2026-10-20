import { useState } from "react";
import { ArrowRight, ShieldCheck, FileCheck2, Eye, EyeOff } from "lucide-react";
import { Brand, Field, FormError, formData } from "../components/ui";
import { send, setCsrf } from "../lib/api";
import type { User } from "../types";
export function Login({
  onLogin,
  notice,
}: {
  onLogin: (user: User) => void;
  notice?: string;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [visible, setVisible] = useState(false);
  async function login(body: unknown, path = "/auth/login") {
    setBusy(true);
    setError("");
    try {
      const x = await send<{ user: User; csrf: string }>(path, body);
      setCsrf(x.csrf);
      onLogin(x.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <section className="login-story">
        <Brand />
        <div>
          <h1>
            Todo en orden,
            <br />
            cada mes.
          </h1>
          <p>Tus pagos, vencimientos y comprobantes en un solo lugar.</p>
          <div className="story-feature">
            <ShieldCheck />
            Tú decides. Tu asistente se encarga.
          </div>
          <div className="story-feature">
            <FileCheck2 />
            Cada pago con su comprobante.
          </div>
        </div>
        <small>Montos en soles · Horario de Lima, Perú</small>
      </section>
      <section className="login-panel">
        <div className="login-form">
          <h2>Bienvenido a Clara</h2>
          <p className="muted">Ingresa a tu espacio de trabajo.</p>
          {notice ? (
            <p className="login-notice" role="status">
              {notice}
            </p>
          ) : null}
          <form
            onSubmit={(e) => {
              const f = formData(e);
              void login({
                email: f.get("email"),
                password: f.get("password"),
              });
            }}
          >
            <Field label="Correo electrónico">
              <input
                name="email"
                type="email"
                autoComplete="username"
                placeholder="tu@correo.com"
                required
                maxLength={150}
              />
            </Field>
            <Field label="Contraseña">
              <div className="password-input">
                <input
                  name="password"
                  type={visible ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Tu contraseña"
                  required
                  maxLength={128}
                />
                <button
                  type="button"
                  aria-label={
                    visible ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </Field>
            <FormError message={error} />
            <button className="button primary full" disabled={busy}>
              {busy ? "Ingresando…" : "Iniciar sesión"}
              <ArrowRight size={19} />
            </button>
          </form>
          <p className="login-foot">
            Clara Gestión de Pagos · Acceso al equipo de trabajo
          </p>
        </div>
      </section>
    </div>
  );
}
