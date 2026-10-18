let csrf = "";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export function setCsrf(value: string) {
  csrf = value;
}
export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrf,
      ...options.headers,
    },
    credentials: "same-origin",
  });
  const data: unknown = await response.json();
  if (!response.ok)
    throw new ApiError(
      data && typeof data === "object" && "error" in data
        ? String(data.error)
        : "No se pudo completar la solicitud.",
      response.status,
    );
  return data as T;
}
export const send = <T = unknown>(
  path: string,
  body: unknown,
  method = "POST",
) => api<T>(path, { method, body: JSON.stringify(body) });
export const money = (cents: number | null) =>
  cents === null
    ? "Por definir"
    : new Intl.NumberFormat("es-PE", {
        style: "currency",
        currency: "PEN",
      }).format(cents / 100);
export const shortDate = (date: string) =>
  new Intl.DateTimeFormat("es-PE", {
    day: "numeric",
    month: "short",
    timeZone: "America/Lima",
  }).format(new Date(`${date}T12:00:00Z`));
export const dateTime = (date: string) =>
  new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Lima",
  }).format(new Date(date.replace(" ", "T") + (date.endsWith("Z") ? "" : "Z")));
export const solesToCents = (value: FormDataEntryValue | null) =>
  value === null || String(value).trim() === ""
    ? null
    : Math.round(Number(value) * 100);
export function exportBills(bills: import("../types").Bill[], month: string) {
  const safe = (x: unknown) =>
    '"' +
    String(x ?? "")
      .replace(/^[=+@-]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  const rows = [
    [
      "Concepto",
      "Proveedor",
      "Vencimiento",
      "Monto PEN",
      "Pagado PEN",
      "Saldo PEN",
      "Estado",
    ],
    ...bills.map((b) => [
      b.title,
      b.supplier,
      b.due_date,
      b.amount_cents === null ? "" : b.amount_cents / 100,
      b.paid_cents / 100,
      b.remaining_cents === null ? "" : b.remaining_cents / 100,
      b.status,
    ]),
  ];
  const url = URL.createObjectURL(
    new Blob(
      ["\uFEFF" + rows.map((row) => row.map(safe).join(",")).join("\r\n")],
      {
        type: "text/csv;charset=utf-8",
      },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `pagos-${month}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
