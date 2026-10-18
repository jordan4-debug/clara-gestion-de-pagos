import { useEffect, useRef, useId } from "react";
import type { ReactNode, FormEvent } from "react";
import {
  X,
  Clock3,
  Check,
  Ellipsis,
  Hourglass,
  AlertCircle,
  Lightbulb,
  Droplet,
  Wifi,
  Landmark,
  Building2,
  FileText,
  ArrowUpRight,
  Repeat2,
} from "lucide-react";
export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      <span>
        Clara<small>Gestión de pagos</small>
      </span>
    </div>
  );
}
export function Badge({ status }: { status: string }) {
  const Icon =
    status === "Pagado"
      ? Check
      : status === "Por definir"
        ? Ellipsis
        : status === "Por autorizar"
          ? Hourglass
          : status === "Bloqueado" || status === "Vencido"
            ? AlertCircle
            : Clock3;
  return (
    <span
      className={`badge ${status === "Pagado" ? "green" : status === "Por definir" ? "gray" : status === "Vencido" || status === "Bloqueado" ? "red" : "amber"}`}
    >
      <Icon size={14} />
      {status}
    </span>
  );
}
export function BillIcon({
  title,
  category,
}: {
  title: string;
  category: string;
}) {
  const Icon = /luz/i.test(title)
    ? Lightbulb
    : /agua/i.test(title)
      ? Droplet
      : /internet/i.test(title)
        ? Wifi
        : category === "Impuestos"
          ? Landmark
          : category === "Alquiler"
            ? Building2
            : category === "Otros"
              ? ArrowUpRight
              : FileText;
  return (
    <span className="bill-icon">
      <Icon size={20} />
    </span>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={wide ? "modal wide" : "modal"}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <header className="modal-head">
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-button"
          aria-label="Cerrar ventana"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}
export function FormError({ message }: { message: string }) {
  return message ? (
    <p role="alert" className="form-error">
      <AlertCircle size={16} />
      {message}
    </p>
  ) : null;
}
export function Empty({
  text = "No hay pagos con estos filtros.",
}: {
  text?: string;
}) {
  return (
    <div className="empty">
      <Repeat2 size={26} />
      <h3>{text}</h3>
      <p>Todo listo para seguir organizando tu mes.</p>
    </div>
  );
}
export function Submit({
  busy,
  children,
}: {
  busy: boolean;
  children: ReactNode;
}) {
  return (
    <button className="button primary" disabled={busy} type="submit">
      {busy ? "Guardando…" : children}
    </button>
  );
}
export function formData(e: FormEvent<HTMLFormElement>) {
  e.preventDefault();
  return new FormData(e.currentTarget);
}
