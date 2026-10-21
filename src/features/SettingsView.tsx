import { useState } from "react";
import { Bell, KeyRound, AlertCircle } from "lucide-react";
import { Field, FormError, Submit, formData } from "../components/ui";
import { send, solesToCents } from "../lib/api";
import { MoneyInput } from "../components/MoneyInput";
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
                    <option value="owner">Gerente</option>
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
                  Solo el gerente puede cambiar los avisos.
                </p>
              )}
            </fieldset>
          </form>
          <FormError message={error} />
        </section>
      ) : null}
      {user.role === "owner" ? (
        <section className="panel settings-panel">
          <h2>
            <AlertCircle size={21} /> Alertas de variación
          </h2>
          <p className="muted">
            Avisa al gerente cuando el importe de un recibo supera al último
            periodo comparable del mismo proveedor y suministro. No solicita
            autorización para pagar.
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
                    variation_enabled: f.has("variation_enabled"),
                    variation_percent: Number(f.get("variation_percent")),
                    variation_min_cents: solesToCents(f.get("variation_min")),
                  },
                  "PUT",
                );
                onChanged();
                notify("Alertas de variación guardadas.");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset disabled={busy}>
              <label className="variation-toggle">
                <input
                  type="checkbox"
                  name="variation_enabled"
                  defaultChecked={settings.variation_enabled ?? true}
                />
                Activar avisos de aumento para el gerente
              </label>
              <div className="form-grid">
                <Field
                  label="Aumento mínimo (%)"
                  hint="Un porcentaje entero entre 1 y 1000."
                >
                  <input
                    type="number"
                    name="variation_percent"
                    min={1}
                    max={1000}
                    step={1}
                    required
                    defaultValue={settings.variation_percent ?? 20}
                  />
                </Field>
                <Field
                  label="Diferencia mínima en soles"
                  hint="La alerta requiere alcanzar ambos umbrales."
                >
                  <MoneyInput
                    name="variation_min"
                    cents={settings.variation_min_cents ?? 1000}
                  />
                </Field>
              </div>
              <p className="info-text">
                Por ejemplo, S/100.00 a S/150.00 equivale a S/50.00 y 50 %. Se
                excluyen cuotas de préstamos, referencias de ejemplo y periodos
                con varios recibos del mismo suministro.
              </p>
              <Submit busy={busy}>Guardar alertas de variación</Submit>
            </fieldset>
          </form>
          <FormError message={error} />
        </section>
      ) : null}
      <section className="panel settings-panel">
        <h2>Control administrativo</h2>
        <p className="muted">
          Se registran recibos, pagos declarados y entregas físicas de efectivo.
          Guardar o revisar una constancia no ejecuta una transacción bancaria.
        </p>
      </section>
      <section className="panel settings-panel full-span">
        <h2>
          {user.demo ? "Espacio compartido de demostración" : "Tu cuenta"}
        </h2>
        {user.demo ? (
          <p className="muted">
            Esta cuenta pública permite explorar el rol con información ficticia
            compartida. Para identificar a cada integrante, usa cuentas
            privadas. El gerente administra los accesos desde Equipo; las
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
