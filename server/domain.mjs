export const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
export function validDate(value) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function monthDate(month, day) {
  const [year, m] = month.split('-').map(Number);
  return `${month}-${String(Math.min(day, new Date(Date.UTC(year, m, 0)).getUTCDate())).padStart(2, '0')}`;
}
export const remaining = (bill) =>
  bill.amount_cents === null ? null : Math.max(0, bill.amount_cents - bill.paid_cents);
export function status(bill, date = today()) {
  if (bill.amount_cents === null) return 'Por definir';
  if (remaining(bill) === 0) return 'Pagado';
  if (bill.approval === 'blocked') return 'Bloqueado';
  if (bill.approval === 'required') return 'Por autorizar';
  if (bill.due_date < date) return 'Vencido';
  if (bill.paid_cents > 0) return 'Parcial';
  return 'Pendiente';
}
export function assertPayable(bill, amount) {
  if (!bill) throw Object.assign(new Error('Pago no encontrado.'), { status: 404 });
  if (bill.amount_cents === null)
    throw Object.assign(new Error('Define el monto antes de pagar.'), { status: 409 });
  if (bill.approval !== 'approved')
    throw Object.assign(new Error('El propietario debe autorizar este pago.'), { status: 403 });
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > remaining(bill))
    throw Object.assign(
      new Error('El abono debe ser mayor a cero y no superar el saldo pendiente.'),
      { status: 409 },
    );
}
