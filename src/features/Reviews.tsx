import { useState } from "react";
import { FileText, ShieldCheck, MessageSquare, Upload } from "lucide-react";
import { Field, FormError, Empty } from "../components/ui";
import { send, money, dateTime } from "../lib/api";
import type { User, Payment, Review } from "../types";

export const reviewLabels = {
  pending: "Por revisar",
  observed: "Observado",
  verified: "Revisado",
};
export async function receiptPayload(file: File) {
  if (
    !file ||
    file.size === 0 ||
    file.size > 3 * 1024 * 1024 ||
    !["application/pdf", "image/png", "image/jpeg"].includes(file.type)
  )
    throw new Error("Adjunta un PDF, PNG o JPG válido, de hasta 3 MB.");
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("No se pudo leer el comprobante."));
    reader.readAsDataURL(file);
  });
  return { name: file.name, mime: file.type, base64 };
}
export function ReviewCard({
  payment: p,
  user,
  onChanged,
  notify,
}: {
  payment: Payment;
  user: User;
  onChanged: () => void;
  notify: (s: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [note, setNote] = useState("");
  const status = p.review_status || "pending";
  const canCorrect =
    status === "observed" &&
    (user.role === "owner" || !p.actor_id || p.actor_id === user.id);
  async function review(next: "verified" | "observed") {
    setBusy(true);
    setError("");
    try {
      await send(`/payments/${p.id}/review`, {
        status: next,
        note,
        revision: p.review_revision || 0,
      });
      setNote("");
      onChanged();
      notify(
        next === "verified"
          ? "Comprobante revisado."
          : "Observación enviada al asistente.",
      );
    } catch (e) {
      setError((e as Error).message);
      if ((e as Error).message.includes("cambió")) onChanged();
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="review-card">
      <header>
        <span className={`review-status ${status}`}>
          <FileText size={15} />
          {reviewLabels[status]}
        </span>
        <strong>{money(p.amount_cents)}</strong>
      </header>
      <p>
        {p.method} · Operación <b>{p.operation}</b>
      </p>
      <small>
        Registrado por {p.actor} · {dateTime(p.created_at)}
      </small>
      {p.destination ? (
        <details className="review-destination">
          <summary>Destino al registrar el abono</summary>
          <p>{p.destination.supplier}</p>
          <p>
            {p.destination.bank || "Banco no indicado"} ·{" "}
            {p.destination.account || "Cuenta no indicada"}
          </p>
          <small>{p.destination.reference || "Sin referencia"}</small>
        </details>
      ) : null}
      {p.receipt_id ? (
        <a
          className="button receipt-link"
          href={`/api/receipts/${p.receipt_id}`}
          target="_blank"
          rel="noreferrer"
        >
          <FileText size={16} />
          Abrir comprobante
        </a>
      ) : (
        <p className="muted">
          Este registro anterior no tiene archivo adjunto.
        </p>
      )}
      {p.review_note ? (
        <div className="review-observation">
          <MessageSquare size={16} />
          <p>{p.review_note}</p>
        </div>
      ) : null}
      {p.reviewed_by && p.reviewed_at ? (
        <small>
          {p.reviewed_by} · {dateTime(p.reviewed_at)}
        </small>
      ) : null}
      {user.role === "owner" && status === "pending" ? (
        <div className="review-actions">
          <Field
            label={`Comentario para el abono #${p.id}`}
            hint="Obligatorio al observar. Revisar no confirma la transferencia bancaria."
          >
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              rows={2}
            />
          </Field>
          <div className="button-row">
            <button
              className="button primary"
              disabled={busy || !p.receipt_id}
              onClick={() => void review("verified")}
            >
              <ShieldCheck size={16} />
              Marcar revisado
            </button>
            <button
              className="button"
              disabled={busy || note.trim().length < 5}
              onClick={() => void review("observed")}
            >
              Observar
            </button>
          </div>
        </div>
      ) : null}
      {canCorrect ? (
        <form
          className="review-actions"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const form = e.currentTarget;
            setBusy(true);
            setError("");
            try {
              const receipt = await receiptPayload(f.get("receipt") as File);
              await send(`/payments/${p.id}/correction`, {
                receipt,
                note: f.get("note"),
                revision: p.review_revision || 0,
              });
              form.reset();
              onChanged();
              notify("Corrección enviada para una nueva revisión.");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field
            label="Comprobante corregido"
            hint="PDF, PNG o JPG · hasta 3 MB"
          >
            <input
              className="file-input"
              type="file"
              name="receipt"
              accept="application/pdf,image/png,image/jpeg"
              required
            />
          </Field>
          <Field label="¿Qué corregiste?">
            <textarea
              name="note"
              minLength={5}
              maxLength={1000}
              required
              rows={2}
            />
          </Field>
          <button className="button primary" disabled={busy}>
            <Upload size={16} />
            {busy ? "Enviando…" : "Enviar corrección"}
          </button>
        </form>
      ) : null}
      {p.review_events?.length ? (
        <details className="review-timeline">
          <summary>Historial de revisión ({p.review_events.length})</summary>
          {p.review_events.map((event, i) => (
            <div key={i}>
              <strong>
                {event.status === "resubmitted"
                  ? "Corrección enviada"
                  : event.status === "observed"
                    ? "Observado"
                    : "Revisado"}
              </strong>
              <p>{event.note || "Constancia conforme"}</p>
              <small>
                {event.actor} · {dateTime(event.created_at)}
              </small>
              {event.receipt_id ? (
                <a
                  href={`/api/receipts/${event.receipt_id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Ver constancia de esta revisión
                </a>
              ) : null}
            </div>
          ))}
        </details>
      ) : null}
      <FormError message={error} />
    </article>
  );
}
export function Reviews({
  items,
  user,
  onChanged,
  onSelect,
  notify,
}: {
  items: Review[];
  user: User;
  onChanged: () => void;
  onSelect: (id: number) => void;
  notify: (s: string) => void;
}) {
  const [filter, setFilter] = useState(
    user.role === "owner" ? "pending" : "observed",
  );
  const filtered = items.filter(
    (p) => filter === "all" || (p.review_status || "pending") === filter,
  );
  return (
    <>
      <div className="workflow-note">
        <ShieldCheck size={20} />
        <p>
          {user.role === "owner"
            ? "Revisa la constancia, el importe y la operación. Si algo no corresponde, deja una observación para corregirlo."
            : "Aquí recibes observaciones y envías la constancia corregida. El importe del abono original se conserva."}
        </p>
      </div>
      <div className="queue-filters" aria-label="Filtrar comprobantes">
        {[
          ["pending", "Por revisar"],
          ["observed", "Observados"],
          ["verified", "Revisados"],
          ["all", "Todos"],
        ].map(([id, label]) => (
          <button
            className={filter === id ? "active" : ""}
            aria-pressed={filter === id}
            key={id}
            onClick={() => setFilter(id)}
          >
            {label}
            <span>
              {
                items.filter(
                  (p) => id === "all" || (p.review_status || "pending") === id,
                ).length
              }
            </span>
          </button>
        ))}
      </div>
      <div className="review-grid">
        {filtered.map((p) => (
          <section className="panel review-container" key={p.id}>
            <div className="panel-title">
              <div>
                <h2>{p.title}</h2>
                <p className="muted">{p.supplier}</p>
              </div>
              <button
                className="text-button"
                onClick={() => onSelect(p.bill_id)}
              >
                Ver pago
              </button>
            </div>
            <ReviewCard
              payment={p}
              user={user}
              onChanged={onChanged}
              notify={notify}
            />
          </section>
        ))}
      </div>
      {!filtered.length ? (
        <Empty text="No hay comprobantes en este estado para el mes seleccionado." />
      ) : null}
    </>
  );
}
