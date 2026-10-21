import { useState } from "react";
import { Field, FormError, useModalLock } from "./ui";
import { send } from "../lib/api";
import type { Supplier } from "../types";

export function EntitySelector({
  suppliers,
  initialId,
  disabled = false,
  loans = false,
  onSelect,
  onCreated,
}: {
  suppliers: Supplier[];
  initialId?: number;
  disabled?: boolean;
  loans?: boolean;
  onSelect?: (supplier: Supplier) => void;
  onCreated?: (supplier: Supplier) => void;
}) {
  const [created, setCreated] = useState<Supplier[]>([]),
    [selected, setSelected] = useState(initialId ? String(initialId) : ""),
    [adding, setAdding] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [name, setName] = useState(""),
    [category, setCategory] = useState(loans ? "Préstamos" : "Servicios"),
    [reference, setReference] = useState("");
  useModalLock(busy);
  const items = [
    ...suppliers,
    ...created.filter((s) => !suppliers.some((p) => p.id === s.id)),
  ]
    .filter(
      (s) =>
        disabled ||
        (loans ? s.category === "Préstamos" : s.category !== "Préstamos"),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  async function save() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const supplier = await send<Supplier>("/suppliers", {
        name,
        category,
        receipt_format: "alphanumeric",
        reference,
      });
      setCreated((previous) => [...previous, supplier]);
      setSelected(String(supplier.id));
      onSelect?.(supplier);
      onCreated?.(supplier);
      setAdding(false);
      setName("");
      setReference("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="entity-selector">
      <Field label={loans ? "Entidad financiera" : "Proveedor o entidad"}>
        <select
          name="supplier_id"
          value={adding ? "" : selected}
          required
          disabled={disabled}
          onChange={(e) => {
            if (e.target.value === "new") {
              setAdding(true);
              setError("");
              return;
            }
            setAdding(false);
            setSelected(e.target.value);
            const supplier = items.find((s) => String(s.id) === e.target.value);
            if (supplier) onSelect?.(supplier);
          }}
        >
          <option value="" disabled>
            {loans
              ? "Selecciona una entidad"
              : "Selecciona un proveedor o entidad"}
          </option>
          {[...new Set(items.map((s) => s.category))].map((group) => (
            <optgroup key={group} label={group}>
              {items
                .filter((s) => s.category === group)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </optgroup>
          ))}
          {!disabled ? (
            <option value="new">
              {loans
                ? "+ Agregar entidad financiera"
                : "+ Agregar proveedor o entidad"}
            </option>
          ) : null}
        </select>
      </Field>
      {adding ? (
        <fieldset
          className="inline-entity"
          disabled={busy}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              (e.target as HTMLElement).tagName === "INPUT"
            ) {
              e.preventDefault();
              void save();
            }
          }}
        >
          <legend>Nueva entidad</legend>
          <p className="muted">
            Se guardará y quedará seleccionada en este registro.
          </p>
          <Field label="Nombre de la nueva entidad">
            <input
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </Field>
          <div className="form-grid">
            <Field label="Tipo de entidad">
              <select
                value={category}
                disabled={loans}
                onChange={(e) => setCategory(e.target.value)}
              >
                {(loans
                  ? ["Préstamos"]
                  : [
                      "Servicios",
                      "Proveedores",
                      "Impuestos",
                      "Alquiler",
                      "Otros",
                    ]
                ).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Referencia administrativa (opcional)">
            <input
              value={reference}
              maxLength={160}
              onChange={(e) => setReference(e.target.value)}
            />
          </Field>
          <FormError message={error} />
          <div className="button-row">
            <button
              type="button"
              className="button"
              onClick={() => setAdding(false)}
            >
              Cancelar entidad
            </button>
            <button
              type="button"
              className="button primary"
              disabled={busy || name.trim().length < 2}
              onClick={() => void save()}
            >
              {busy ? "Guardando…" : "Guardar y seleccionar"}
            </button>
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}
