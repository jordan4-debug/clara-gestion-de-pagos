// Adjustable administrative formats; no provider-specific official numbering is presumed.
export const receiptFormats = {
  numeric: {
    label: "Solo números",
    pattern: "[0-9]{1,40}",
    hint: "De 1 a 40 dígitos. Conserva los ceros iniciales.",
  },
  alphanumeric: {
    label: "Letras y números",
    pattern: "(?=.{1,60}$)[A-Za-z0-9]+(?:(?:\\x2D|\\x2F)[A-Za-z0-9]+)*",
    hint: "Letras y números; guion o barra entre grupos. Sin espacios. Máximo 60 caracteres.",
  },
};
export function receiptError(number, format = "alphanumeric") {
  if (!receiptFormats[format]) return "Selecciona un formato de recibo válido.";
  if (typeof number !== "string" || !number)
    return "Ingresa el número de recibo.";
  if (format === "numeric" && !/^[0-9]{1,40}$/.test(number))
    return "Este recibo admite únicamente de 1 a 40 dígitos del 0 al 9, sin espacios ni símbolos.";
  if (
    format === "alphanumeric" &&
    (number.length > 60 || !/^[A-Za-z0-9]+(?:[-/][A-Za-z0-9]+)*$/.test(number))
  )
    return "Usa letras y números, con guion o barra solo entre grupos; sin espacios ni otros símbolos (máximo 60 caracteres).";
  return "";
}
export function decimalCents(value) {
  const text = String(value ?? "");
  if (!text.trim()) return null;
  // No rounding: a third decimal is an error, not an amount to silently change.
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text))
    throw new Error(
      "Ingresa un importe válido con hasta dos decimales, por ejemplo 25.00 o 1,250.75.",
    );
  const [whole, fraction = ""] = text.replaceAll(",", "").split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > 100000000)
    throw new Error("El importe debe estar entre 0.00 y 1,000,000.00 soles.");
  return cents;
}
export const decimalText = (cents) =>
  cents == null
    ? ""
    : `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
export const paymentDay = (payment) =>
  payment.payment_date || payment.created_at?.slice(0, 10);
export function selectExpenses(
  bills,
  { tab = "month", month, category = "all", query = "" },
) {
  return bills
    .filter(
      (b) =>
        (tab === "all" || b.month === month) &&
        (tab === "all" ||
          tab === "month" ||
          (tab === "paid"
            ? b.status === "Pagado"
            : tab === "overdue"
              ? b.status === "Vencido"
              : b.status !== "Pagado" && b.status !== "Vencido")) &&
        (category === "all" || b.category === category) &&
        `${b.title} ${b.supplier} ${b.invoice_number || ""}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
    )
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id - b.id);
}
