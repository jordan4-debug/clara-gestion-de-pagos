import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Field, FormError, Submit, formData } from "../components/ui";
import { send } from "../lib/api";
import { Suppliers } from "./Management";
import { Team } from "./Team";
import type { Supplier, User } from "../types";

export function SettingsView({
  user,
  suppliers,
  onNewSupplier,
  onEditSupplier,
  notify,
  publicDemo,
}: {
  user: User;
  suppliers: Supplier[];
  onNewSupplier: () => void;
  onEditSupplier: (supplier: Supplier) => void;
  notify: (s: string) => void;
  publicDemo: boolean;
}) {
  return (
    <div className="settings-grid">
      {user.role === "owner" ? (
        <section className="full-span settings-access">
          <h2>Equipo y acceso</h2>
          <Team user={user} notify={notify} publicDemo={publicDemo} />
          <AccountAccess user={user} notify={notify} />
        </section>
      ) : (
        <>
          <div className="full-span">
            <Suppliers
              items={suppliers}
              user={user}
              onNew={onNewSupplier}
              onEdit={onEditSupplier}
            />
          </div>
          <section className="panel settings-panel full-span">
            <h2>Control administrativo</h2>
            <p className="muted">
              Se registran recibos, pagos declarados y dinero entregado al
              asistente. Guardar o revisar una constancia no ejecuta una
              transacción bancaria.
            </p>
          </section>
          <AccountAccess user={user} notify={notify} />
        </>
      )}
    </div>
  );
}

function AccountAccess({
  user,
  notify,
}: {
  user: User;
  notify: (s: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <section className="panel settings-panel full-span">
      <h2>
        <KeyRound size={21} /> Acceso de tu cuenta
      </h2>
      {user.demo ? (
        <p className="muted">
          Esta cuenta pública permite explorar el rol con información ficticia
          compartida. Para identificar a cada integrante, usa cuentas privadas.
          El gerente administra los accesos desde Equipo; las cuentas de
          demostración no administran usuarios privados.
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
  );
}
