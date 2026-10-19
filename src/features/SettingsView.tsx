import { useState } from "react";
import { Bell, KeyRound, AlertCircle } from "lucide-react";
import { Field, FormError, Submit, formData } from "../components/ui";
import { send } from "../lib/api";
import type { Settings, User } from "../types";
export function SettingsView({
  settings,
  user,
  onChanged,
  notify,
}: {
  settings: Settings;
  user: User;
  onChanged: () => void;
  notify: (s: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="settings-grid">
      {user.role === "owner" ? (
        <section className="panel settings-panel">
          <h2>
            <Bell size={21} />
            Vencimientos y avisos
          </h2>
          <p className="muted">
            Los pagos se gestionan directamente, sin autorización previa del
            gerente.
          </p>
          <form
            onSubmit={async (e) => {
              const f = formData(e);
              setBusy(true);
              setError("");
              try {
                await send(
                  "/settings",
                  {
                    reminder_days: Number(f.get("days")),
                    recipient: f.get("recipient"),
                  },
                  "PUT",
                );
                onChanged();
                notify("Avisos guardados.");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset disabled={user.role !== "owner" || busy}>
              <div className="form-grid">
                <Field label="Días de anticipación">
                  <input
                    name="days"
                    type="number"
                    min={0}
                    max={30}
                    required
                    defaultValue={settings.reminder_days}
                  />
                </Field>
                <Field label="Quién recibe el aviso">
                  <select name="recipient" defaultValue={settings.recipient}>
                    <option value="both">Ambos</option>
                    <option value="owner">Propietario</option>
                    <option value="assistant">Asistente</option>
                  </select>
                </Field>
              </div>
              <p className="info-text">
                <Bell size={15} />
                Los avisos aparecen dentro de la aplicación al ingresar. No se
                envían correos ni mensajes de WhatsApp.
              </p>
              {user.role === "owner" ? (
                <Submit busy={busy}>Guardar avisos</Submit>
              ) : (
                <p className="muted">
                  Solo el propietario puede cambiar los avisos.
                </p>
              )}
            </fieldset>
          </form>
          <FormError message={error} />
        </section>
      ) : null}
      <section className="panel settings-panel">
        <h2>
          <KeyRound size={21} />
          Pagos reales
        </h2>
        <span className="gateway-state">
          <AlertCircle size={18} />
          Desactivados en esta demostración
        </span>
        <p className="muted">
          La integración con Izipay se realizará en la siguiente etapa, cuando
          el comercio esté habilitado.
        </p>
        <div className="notice">
          <strong>Registro de pagos externos</strong>
          <p>
            Puedes ensayar un abono y adjuntar un comprobante ficticio.
            Registrar un pago aquí no mueve dinero ni verifica una transferencia
            bancaria.
          </p>
        </div>
      </section>
      <section className="panel settings-panel full-span">
        <h2>
          {user.demo ? "Espacio compartido de demostración" : "Tu cuenta"}
        </h2>
        {user.demo ? (
          <p className="muted">
            Esta cuenta pública permite explorar el rol con información ficticia
            compartida. Para identificar a cada integrante, usa cuentas
            privadas. El propietario administra los accesos desde Equipo; las
            cuentas de demostración no administran usuarios privados.
          </p>
        ) : (
          <form
            className="password-form"
            onSubmit={async (e) => {
              const node = e.currentTarget,
                f = formData(e);
              setBusy(true);
              setError("");
              try {
                await send("/auth/password", {
                  current: f.get("current"),
                  password: f.get("password"),
                });
                node.reset();
                notify("Contraseña actualizada.");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Contraseña actual">
              <input
                name="current"
                type="password"
                autoComplete="current-password"
                required
              />
            </Field>
            <Field label="Nueva contraseña (12 caracteres o más)">
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
            </Field>
            <Submit busy={busy}>Actualizar contraseña</Submit>
            <FormError message={error} />
          </form>
        )}
      </section>
    </div>
  );
}
