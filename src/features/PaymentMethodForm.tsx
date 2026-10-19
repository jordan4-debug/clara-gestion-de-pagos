import { useState } from "react";
import { Modal, Field, FormError, Submit, formData } from "../components/ui";
import { send } from "../lib/api";
import type { Supplier } from "../types";
export const methodNames = [
  "Portal de entidad",
  "Transferencia",
  "Yape",
  "Plin",
  "Ventanilla",
  "Otro",
];
export function PaymentMethodForm({
  supplier,
  onClose,
  onSaved,
}: {
  supplier: Supplier;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [gateway, setGateway] = useState(
    supplier.payment_gateway || (supplier.portal ? "portal" : "manual"),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title={`Métodos de pago · ${supplier.name}`} onClose={onClose}>
      <form
        className="form-body"
        onSubmit={async (e) => {
          const f = formData(e);
          setBusy(true);
          setError("");
          try {
            await send(
              `/suppliers/${supplier.id}`,
              {
                ...supplier,
                payment_gateway: gateway,
                payment_url: String(f.get("payment_url") || ""),
                payment_methods: f.getAll("payment_methods"),
              },
              "PUT",
            );
            onSaved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Canal para realizar el pago">
          <select
            value={gateway}
            onChange={(e) => setGateway(e.target.value as typeof gateway)}
          >
            <option value="portal">Portal oficial del proveedor</option>
            <option value="manual">Banco o billetera digital</option>
            <option value="izipay">Izipay · activación pendiente</option>
          </select>
        </Field>
        {gateway === "portal" ? (
          <Field
            label="Dirección oficial del portal de pago"
            hint="Se abrirá desde el pago creado. Usa únicamente el sitio de la entidad."
          >
            <input
              name="payment_url"
              type="url"
              pattern="https://.*"
              required
              maxLength={300}
              defaultValue={supplier.payment_url || supplier.portal}
            />
          </Field>
        ) : null}
        {gateway === "izipay" ? (
          <div className="notice">
            <strong>Integración pendiente de credenciales</strong>
            <p>
              El checkout y su QR se habilitarán al configurar Izipay. Elegir
              esta opción no genera cobros ni un QR de prueba.
            </p>
          </div>
        ) : null}
        <fieldset className="method-options">
          <legend>Métodos aceptados por este proveedor</legend>
          {methodNames.map((m) => (
            <label className="checkbox-line" key={m}>
              <input
                type="checkbox"
                name="payment_methods"
                value={m}
                defaultChecked={(
                  supplier.payment_methods ||
                  (supplier.payment_url || supplier.portal
                    ? [
                        "Portal de entidad",
                        "Transferencia",
                        "Ventanilla",
                        "Otro",
                      ]
                    : ["Transferencia", "Yape", "Plin", "Ventanilla", "Otro"])
                ).includes(m)}
              />
              {m}
            </label>
          ))}
        </fieldset>
        <p className="info-text">
          El método se elige dentro de cada pago. La confirmación del pago
          corresponde al banco, billetera o pasarela utilizada.
        </p>
        <FormError message={error} />
        <div className="form-actions">
          <button
            className="button"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <Submit busy={busy}>Guardar métodos</Submit>
        </div>
      </form>
    </Modal>
  );
}
