import { MoneyInput } from "../components/MoneyInput";
import { EntitySelector } from "../components/EntitySelector";
import { ReceiptFields } from "../components/ReceiptFields";
import { receiptError, comparableReference } from "../../shared/expenses.mjs";
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
  onSupplierCreated,
}: {
  suppliers: Supplier[];
  bill?: Bill;
  month: string;
  onSupplierCreated?: (supplier: Supplier) => void;
} & Props) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [category, setCategory] = useState(bill?.category || ""),
    [reference, setReference] = useState(bill?.service_reference || ""),
    [receiptFormat, setReceiptFormat] = useState("alphanumeric");
  return (
    <Modal
      title={
        bill?.opening_balance_cents != null
          ? "Editar notas de la cuota"
          : bill
            ? "Editar vencimiento y notas"
            : "Registrar recibo"
      }
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
        <EntitySelector
          suppliers={suppliers}
          initialId={bill?.supplier_id}
          disabled={!!bill}
          onCreated={onSupplierCreated}
          onSelect={(supplier) => {
            setCategory(supplier.category);
            setReceiptFormat(supplier.receipt_format || "alphanumeric");
            setReference(
              comparableReference(supplier.reference) ? supplier.reference : "",
            );
          }}
        />
        {!bill ? (
          <>
            <Field
              label="Categoría del gasto"
              hint="Se asigna automáticamente según el proveedor o entidad."
            >
              <input
                name="category"
                readOnly
                value={category}
                placeholder="Selecciona primero el proveedor o entidad"
              />
            </Field>
            <ReceiptFields format={receiptFormat} />
            <Field
              label="Código de suministro o contrato (opcional)"
              hint="Usa la misma referencia en cada periodo para comparar los importes de este servicio."
            >
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
          <Field
            label="Vencimiento"
            hint={
              bill?.opening_balance_cents != null
                ? "Fecha fijada por el cronograma calculado del préstamo."
                : undefined
            }
          >
            <input
              name="due_date"
              type="date"
              required
              min="1900-01-01"
              max="2099-12-31"
              readOnly={bill?.opening_balance_cents != null}
              defaultValue={
                bill?.due_date ||
                (month !== localToday().slice(0, 7)
                  ? `${month}-01`
                  : localToday())
              }
            />
          </Field>
        </div>
        {!bill ? (
          <Field label="Fecha de emisión (opcional)">
            <input
              name="issued_date"
              type="date"
              min="1900-01-01"
              max={localToday()}
            />
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
        <input
          type="hidden"
          name="receipt_format"
          value={supplier?.receipt_format || "alphanumeric"}
        />
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
            <MoneyInput name="amount" required={false} />
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
