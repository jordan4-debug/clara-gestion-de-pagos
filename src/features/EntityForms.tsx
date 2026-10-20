import { MoneyInput } from "../components/MoneyInput";
import { ReceiptFields } from "../components/ReceiptFields";
import { receiptError } from "../../shared/expenses.mjs";
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
    [reference, setReference] = useState(bill?.service_reference || ""),
    [receiptFormat, setReceiptFormat] = useState("alphanumeric");
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
            if (!bill) {
              const error = receiptError(
                String(f.get("invoice_number") || ""),
                String(f.get("receipt_format")),
              );
              if (error) throw new Error(error);
            }
            await send(
              bill ? `/bills/${bill.id}` : "/bills",
              {
                ...(!bill
                  ? { invoice: await receiptPayload(f.get("invoice") as File) }
                  : {}),
                invoice_number: f.get("invoice_number") || bill?.invoice_number,
                receipt_format: f.get("receipt_format") || bill?.receipt_format,
                issued_date:
                  f.get("issued_date") || bill?.issued_date || undefined,
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
                setReceiptFormat(supplier.receipt_format || "alphanumeric");
                setReference(supplier.reference || "");
              }
            }}
          >
            <option value="" disabled>
              Selecciona un proveedor
            </option>
            {suppliers
              .filter((s) => !!bill || s.category !== "Préstamos")
              .map((s) => (
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
                  "Otros",
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <ReceiptFields key={receiptFormat} defaultFormat={receiptFormat} />
            <Field label="Código de servicio o referencia (opcional)">
              <input
                name="service_reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                maxLength={160}
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
            <MoneyInput
              name="amount"
              cents={bill?.amount_cents}
              readOnly={bill?.amount_cents != null}
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
          <Field label="Fecha de emisión (opcional)">
            <input name="issued_date" type="date" max={localToday()} />
          </Field>
        ) : null}
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
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      title={supplier ? "Editar entidad" : "Nueva entidad"}
      onClose={onClose}
    >
      <form
        className="form-body"
        onSubmit={async (e) => {
          const f = formData(e);
          setBusy(true);
          setError("");
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
        <Field label="Nombre de la entidad">
          <input
            name="name"
            defaultValue={supplier?.name}
            minLength={2}
            maxLength={120}
            required
          />
        </Field>
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
        <Field label="Formato habitual de recibo">
          <select
            name="receipt_format"
            defaultValue={supplier?.receipt_format || "alphanumeric"}
          >
            <option value="numeric">Solo números</option>
            <option value="alphanumeric">Letras y números</option>
          </select>
        </Field>
        <Field label="Referencia administrativa (opcional)">
          <input
            name="reference"
            defaultValue={supplier?.reference}
            maxLength={160}
          />
        </Field>
        <FormError message={error} />
        <div className="form-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancelar
          </button>
          <Submit busy={busy}>Guardar entidad</Submit>
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
