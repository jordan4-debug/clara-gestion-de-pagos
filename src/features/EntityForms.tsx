import { useState } from 'react';
import { Modal, Field, FormError, Submit, formData } from '../components/ui';
import { send, solesToCents } from '../lib/api';
import type { Bill, Supplier } from '../types';
type Props = { onClose: () => void; onSaved: (month?: string) => void };
export function BillForm({
  suppliers,
  bill,
  month,
  onClose,
  onSaved,
}: { suppliers: Supplier[]; bill?: Bill; month: string } & Props) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <Modal title={bill ? 'Editar pago' : 'Nuevo pago'} onClose={onClose}>
      <form
        className="form-body"
        onSubmit={async (e) => {
          const f = formData(e);
          setBusy(true);
          setError('');
          const due = String(f.get('due_date'));
          try {
            await send(
              bill ? `/bills/${bill.id}` : '/bills',
              {
                title: f.get('title'),
                supplier_id: Number(f.get('supplier_id')),
                amount_cents: solesToCents(f.get('amount')),
                due_date: due,
                notes: f.get('notes'),
              },
              bill ? 'PATCH' : 'POST',
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
            required
            minLength={2}
            maxLength={120}
            defaultValue={bill?.title}
            placeholder="Ej. Servicio de luz"
          />
        </Field>
        <Field label="Proveedor o entidad">
          <select name="supplier_id" required defaultValue={bill?.supplier_id || ''}>
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
        <div className="form-grid">
          <Field label="Monto en soles" hint="Déjalo vacío si aún no conoces el monto.">
            <input
              name="amount"
              type="number"
              min="0.01"
              max="1000000"
              step="0.01"
              defaultValue={bill?.amount_cents ? bill.amount_cents / 100 : ''}
              placeholder="Por definir"
            />
          </Field>
          <Field label="Vencimiento">
            <input
              name="due_date"
              type="date"
              required
              defaultValue={bill?.due_date || `${month}-20`}
            />
          </Field>
        </div>
        <Field label="Notas / procedimiento de pago">
          <textarea
            name="notes"
            maxLength={2000}
            rows={3}
            defaultValue={bill?.notes}
            placeholder="Referencia, declaración o instrucciones para tu asistente"
          />
        </Field>
        <p className="info-text">
          Los impuestos se ingresan según la declaración o el recibo de la entidad. El sistema no
          calcula tributos.
        </p>
        <FormError message={error} />
        <div className="form-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancelar
          </button>
          <Submit busy={busy}>{bill ? 'Guardar cambios' : 'Crear pago'}</Submit>
        </div>
      </form>
    </Modal>
  );
}
export function SupplierForm({ supplier, onClose, onSaved }: { supplier?: Supplier } & Props) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <Modal title={supplier ? 'Editar proveedor' : 'Nuevo proveedor'} onClose={onClose}>
      <form
        className="form-body"
        onSubmit={async (e) => {
          const f = formData(e);
          setError('');
          setBusy(true);
          try {
            await send(
              supplier ? `/suppliers/${supplier.id}` : '/suppliers',
              Object.fromEntries(f),
              supplier ? 'PUT' : 'POST',
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
            <select name="category" defaultValue={supplier?.category || 'Servicios'}>
              {['Servicios', 'Impuestos', 'Alquiler', 'Préstamos', 'Otros'].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="Canal de pago">
            <select name="channel" defaultValue={supplier?.channel || 'external'}>
              <option value="external">Banco o portal de entidad</option>
            </select>
          </Field>
        </div>
        <p className="info-text">
          Culqi abona al comercio de las llaves configuradas. No realiza transferencias a la cuenta
          bancaria de esta ficha.
        </p>
        <div className="form-grid">
          <Field label="Banco">
            <input name="bank" maxLength={100} defaultValue={supplier?.bank} />
          </Field>
          <Field label="Cuenta / CCI">
            <input name="account" maxLength={50} defaultValue={supplier?.account} />
          </Field>
        </div>
        <Field label="Referencia / suministro">
          <input name="reference" maxLength={160} defaultValue={supplier?.reference} />
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
export function TemplateForm({ suppliers, onClose, onSaved }: { suppliers: Supplier[] } & Props) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="Nuevo gasto recurrente" onClose={onClose}>
      <form
        className="form-body"
        onSubmit={async (e) => {
          const f = formData(e);
          setBusy(true);
          setError('');
          try {
            await send('/templates', {
              title: f.get('title'),
              supplier_id: Number(f.get('supplier_id')),
              amount_cents: solesToCents(f.get('amount')),
              day: Number(f.get('day')),
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
          <input name="title" required minLength={2} maxLength={120} autoFocus />
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
          <Field label="Monto fijo en soles" hint="Vacío: crear cada mes por definir monto.">
            <input name="amount" type="number" min="0.01" max="1000000" step="0.01" />
          </Field>
          <Field label="Día de vencimiento" hint="Se ajusta al último día en meses cortos.">
            <input name="day" type="number" min={1} max={31} required defaultValue={20} />
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
