import { useState, useEffect } from "react";
import { api, send, money, localToday } from "../lib/api";
import { FormError } from "../components/ui";
import type { Bill, Finance } from "../types";
export function SimulatedPayment({
  bill,
  onChanged,
  notify,
}: {
  bill: Bill;
  onChanged: () => void;
  notify: (message: string) => void;
}) {
  const [finance, setFinance] = useState<Finance | null>(null),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [requestId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    let live = true;
    void api<Finance>(`/finance?month=${localToday().slice(0, 7)}`)
      .then((f) => {
        if (live) setFinance(f);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <section className="detail-section simulation-panel">
      <div className="section-head">
        <h3>Pago simulado</h3>
        <span className="badge amber">Sin dinero real</span>
      </div>
      <p>
        Importe fijo pendiente: <strong>{money(bill.remaining_cents)}</strong> ·
        Destino ficticio: <strong>DEMO-DESTINO-{bill.supplier_id}</strong>.
      </p>
      <p className="muted">
        {bill.supplier} · Referencia:{" "}
        {bill.service_reference || bill.reference || "Sin referencia"}
      </p>
      {finance ? (
        <p>
          Saldo de prueba de {finance.month}:{" "}
          <strong>
            {finance.configured
              ? money(finance.available_cents)
              : "Sin configurar"}
          </strong>
          .{" "}
          {finance.configured
            ? ""
            : "El propietario debe definir el saldo inicial del mes."}
        </p>
      ) : (
        <p>Cargando saldo de prueba…</p>
      )}
      <FormError message={error} />
      {!confirm ? (
        <button
          className="button primary"
          disabled={!finance?.configured}
          onClick={() => setConfirm(true)}
        >
          Pagar {money(bill.remaining_cents)} en prueba
        </button>
      ) : (
        <div className="simulation-confirm">
          <p>
            Se descontará el pendiente de la cuenta ficticia y se generará un
            voucher interno. Esta acción no paga al proveedor ni al SAT/SATT.
          </p>
          <div className="button-row">
            <button
              className="button"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              Cancelar
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const result = await send<{ operation: string }>(
                    `/bills/${bill.id}/simulate`,
                    { request_id: requestId },
                  );
                  notify(`Pago simulado registrado · ${result.operation}`);
                  onChanged();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Procesando…" : "Confirmar pago simulado"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
