import { useState } from "react";
import { Field, FormError, Submit, formData } from "../components/ui";
import { send, money, solesToCents } from "../lib/api";
import type { Finance } from "../types";
export function FinanceOverview({
  finance,
  onChanged,
}: {
  finance: Finance;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <section
      className="finance-overview"
      aria-label="Resumen ejecutivo financiero"
    >
      <div className="finance-heading">
        <p>
          <strong>Cuenta de prueba</strong> · {finance.month} · Sin dinero real
        </p>
        <button
          className="text-button"
          onClick={() => {
            setEditing(!editing);
            setError("");
          }}
        >
          {editing ? "Cerrar configuración" : "Configurar saldo inicial"}
        </button>
      </div>
      <div className="role-metrics monthly-metrics executive-metrics">
        {[
          [
            "Saldo inicial",
            finance.configured
              ? money(finance.initial_cents)
              : "Sin configurar",
            "blue",
          ],
          ["Total pagado en el mes", money(finance.paid_cents), "green"],
          ["Total por pagar", money(finance.pending_cents), "amber"],
          [
            "Saldo final disponible",
            finance.configured
              ? money(finance.available_cents)
              : "Sin configurar",
            "gray",
          ],
        ].map(([label, value, tone]) => (
          <div key={label} className={`role-metric ${tone}`}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <p className="finance-projection">
        Proyección después de pagar el pendiente conocido:{" "}
        <strong>
          {finance.configured
            ? money(finance.projected_cents)
            : "Configura el saldo inicial del mes"}
        </strong>
        .
      </p>
      <p className="muted finance-explanation">
        El total pagado corresponde a operaciones registradas durante este mes,
        incluso de deudas de otros periodos. El saldo es un presupuesto de
        prueba; no representa tu saldo bancario real.
      </p>
      {editing ? (
        <form
          className="finance-form"
          onSubmit={async (e) => {
            const f = formData(e);
            setBusy(true);
            setError("");
            try {
              await send(
                `/finance/${finance.month}`,
                {
                  initial_cents: solesToCents(f.get("initial")),
                  account: f.get("account"),
                  revision: finance.revision,
                },
                "PUT",
              );
              setEditing(false);
              onChanged();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field
            label="Saldo inicial de prueba (S/)"
            hint="Configura el presupuesto mensual. No es una recarga ni un depósito."
          >
            <input
              name="initial"
              type="number"
              min="0"
              max="1000000"
              step="0.01"
              defaultValue={finance.initial_cents / 100}
              required
            />
          </Field>
          <Field
            label="Cuenta ficticia de origen"
            hint="Solo identificadores DEMO-. No ingreses cuentas bancarias reales."
          >
            <input
              name="account"
              pattern="DEMO-[A-Z0-9-]{3,40}"
              defaultValue={finance.account}
              required
              maxLength={45}
            />
          </Field>
          <FormError message={error} />
          <Submit busy={busy}>Guardar saldo inicial</Submit>
        </form>
      ) : null}
    </section>
  );
}
