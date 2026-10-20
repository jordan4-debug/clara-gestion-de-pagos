import { useState } from "react";
import { Modal, Field, FormError, Submit, formData } from "../components/ui";
import { send, solesToCents, localToday } from "../lib/api";
import { receiptPayload } from "./Reviews";
import type { Bill, Supplier } from "../types";
type Props = { onClose: () => void; onSaved: (month?: string) => void };
export function BillForm({
  suppliers,
  bill,
  month,
  onClose,
  onSaved,
}: { suppliers: Supplier[]; bill?: Bill; month: string } & Props) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [category, setCategory] = useState(bill?.category || "Servicios"),
    [reference, setReference] = useState(bill?.service_reference || "");
  return (
    <Modal
      title={bill ? "Editar vencimiento y notas" : "Registrar recibo"}
      onClose={onClose}
    >
      <form
        className="form-body"
        onSubmit={async (e) => {
          const f = formData(e);
          setBusy(true);
          setError("");
          const due = String(f.get("due_date"));
          try {
            await send(
              bill ? `/bills/${bill.id}` : "/bills",
              {
                ...(!bill
                  ? { invoice: await receiptPayload(f.get("invoice") as File) }
                  : {}),
                invoice_number: f.get("invoice_number") || bill?.invoice_number,
                category: f.get("category") || bill?.category,
                service_reference:
                  f.get("service_reference") || bill?.service_reference,
                title: f.get("title"),
                supplier_id: bill?.supplier_id || Number(f.get("supplier_id")),
                amount_cents: solesToCents(f.get("amount")),
                due_date: due,
                notes: f.get("notes"),
              },
              bill ? "PATCH" : "POST",
            );
            onSaved(due.slice(0, 7));
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Concepto">
          <input
            autoFocus
            name="title"
            readOnly={!!bill}
            required
            minLength={2}
            maxLength={120}
            defaultValue={bill?.title}
            placeholder="Ej. Servicio de luz"
          />
        </Field>
        <Field label="Proveedor o entidad">
          <select
            name="supplier_id"
            disabled={!!bill}
            required
            defaultValue={bill?.supplier_id || ""}
            onChange={(e) => {
              const supplier = suppliers.find(
                (s) => s.id === Number(e.target.value),
              );
              if (supplier) {
                setCategory(supplier.category);
                setReference(
                  supplier.account ||
                    supplier.reference ||
                    `DEMO-DESTINO-${supplier.id}`,
                );
              }
            }}
          >
            <option value="" disabled>
              Selecciona un proveedor
            </option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        {!bill ? (
          <>
            <Field label="Categoría">
              <select
                name="category"
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {[
                  "Servicios",
                  "Proveedores",
                  "Impuestos",
                  "Alquiler",
                  "Préstamos",
                  "Otros",
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <Field label="Número del recibo / factura">
              <input
                name="invoice_number"
                required
                maxLength={100}
                placeholder="Ej. F001-000123"
              />
            </Field>
            <Field label="Cuenta / código de suministro o tributo">
              <input
                name="service_reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                maxLength={160}
                required
                placeholder="Referencia que aparece en el recibo"
              />
            </Field>
          </>
        ) : null}
        <div className="form-grid">
          <Field
            label="Monto en soles"
            hint={
              bill?.amount_cents != null
                ? "Monto fijado al crear el pago. No se puede modificar."
                : "Define el importe una sola vez."
            }
          >
            <input
              name="amount"
              type="number"
              required
              readOnly={bill?.amount_cents != null}
              min="0.01"
              max="1000000"
              step="0.01"
              defaultValue={bill?.amount_cents ? bill.amount_cents / 100 : ""}
              placeholder="Por definir"
            />
          </Field>
          <Field label="Vencimiento">
            <input
              name="due_date"
              type="date"
              required
              min={
                bill?.due_date && bill.due_date < localToday()
                  ? bill.due_date
                  : localToday()
              }
              defaultValue={
                bill?.due_date ||
                (month > localToday().slice(0, 7)
                  ? `${month}-01`
                  : localToday())
              }
            />
          </Field>
        </div>
        {!bill ? (
          <Field
            label="Recibo original"
            hint="Foto o PDF de la obligación que se va a pagar · hasta 5 MB"
          >
            <input
              className="file-input"
              type="file"
              name="invoice"
              accept="application/pdf,image/png,image/jpeg"
              required
            />
          </Field>
        ) : null}
        <Field label="Notas / procedimiento de pago (opcional)">
          <textarea
            name="notes"
            maxLength={2000}
            rows={3}
            defaultValue={bill?.notes}
            placeholder="Referencia, declaración o instrucciones para tu asistente"
          />
        </Field>
        <p className="info-text">
          Los impuestos se ingresan según la declaración o el recibo de la
          entidad. El sistema no calcula tributos.
        </p>
        <FormError message={error} />
        <div className="form-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancelar
          </button>
          <Submit busy={busy}>
            {bill ? "Guardar cambios" : "Guardar recibo"}
          </Submit>
        </div>
      </form>
    </Modal>
  );
}
export function SupplierForm({
  supplier,
  onClose,
  onSaved,
}: { supplier?: Supplier } & Props) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title={supplier ? "Editar proveedor" : "Nuevo proveedor"}
      onClose={onClose}
    >
      <form
        className="form-body"
        onSubmit={async (e) => {
          const f = formData(e);
          setError("");
          setBusy(true);
          try {
            await send(
              supplier ? `/suppliers/${supplier.id}` : "/suppliers",
              Object.fromEntries(f),
              supplier ? "PUT" : "POST",
            );
            onSaved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Nombre del proveedor">
          <input
            autoFocus
            name="name"
            required
            minLength={2}
            maxLength={120}
            defaultValue={supplier?.name}
          />
        </Field>
        <div className="form-grid">
          <Field label="Categoría">
            <select
              name="category"
              defaultValue={supplier?.category || "Servicios"}
            >
              {[
                "Servicios",
                "Proveedores",
                "Impuestos",
                "Alquiler",
                "Préstamos",
                "Otros",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="Canal de pago">
            <select
              name="channel"
              defaultValue={supplier?.channel || "external"}
            >
              <option value="external">Banco o portal de entidad</option>
            </select>
          </Field>
        </div>
        <p className="info-text">
          Estos datos ayudan a preparar el pago en el banco o portal de la
          entidad. El sistema conserva el registro y su comprobante; no ejecuta
          transferencias.
        </p>
        <div className="form-grid">
          <Field label="Banco">
            <input name="bank" maxLength={100} defaultValue={supplier?.bank} />
          </Field>
          <Field label="Cuenta / CCI">
            <input
              name="account"
              maxLength={50}
              defaultValue={supplier?.account}
            />
          </Field>
        </div>
        <Field label="Referencia / suministro">
          <input
            name="reference"
            maxLength={160}
            defaultValue={supplier?.reference}
          />
        </Field>
        <Field label="Portal oficial (HTTPS)">
          <input
            name="portal"
            type="url"
            pattern="https://.*"
            maxLength={300}
            defaultValue={supplier?.portal}
            placeholder="https://…"
          />
        </Field>
        <FormError message={error} />
        <div className="form-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancelar
          </button>
          <Submit busy={busy}>Guardar proveedor</Submit>
        </div>
      </form>
    </Modal>
  );
}
export function TemplateForm({
  suppliers,
  onClose,
  onSaved,
}: { suppliers: Supplier[] } & Props) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="Nuevo gasto recurrente" onClose={onClose}>
      <form
        className="form-body"
        onSubmit={async (e) => {
          const f = formData(e);
          setBusy(true);
          setError("");
          try {
            await send("/templates", {
              title: f.get("title"),
              supplier_id: Number(f.get("supplier_id")),
              amount_cents: solesToCents(f.get("amount")),
              day: Number(f.get("day")),
            });
            onSaved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Concepto">
          <input
            name="title"
            required
            minLength={2}
            maxLength={120}
            autoFocus
          />
        </Field>
        <Field label="Proveedor">
          <select name="supplier_id" required>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="form-grid">
          <Field
            label="Monto fijo en soles"
            hint="Vacío: crear cada mes por definir monto."
          >
            <input
              name="amount"
              type="number"
              min="0.01"
              max="1000000"
              step="0.01"
            />
          </Field>
          <Field
            label="Día de vencimiento"
            hint="Se ajusta al último día en meses cortos."
          >
            <input
              name="day"
              type="number"
              min={1}
              max={31}
              required
              defaultValue={20}
            />
          </Field>
        </div>
        <FormError message={error} />
        <div className="form-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancelar
          </button>
          <Submit busy={busy}>Crear recurrente</Submit>
        </div>
      </form>
    </Modal>
  );
}
