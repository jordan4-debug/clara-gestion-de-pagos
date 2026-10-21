import { z } from "zod";
import { cents, date } from "./validation.mjs";
import { monthDate } from "./domain.mjs";

// A percentage of the original principal for the WHOLE contract, not an annual rate.
export const scheduleInput = z
  .object({
    principal_cents: cents,
    total_interest_percent: z
      .number()
      .min(0)
      .max(1000)
      .refine(
        (value) => /^\d+(?:\.\d{1,2})?$/.test(String(value)),
        "La tasa total admite hasta dos decimales.",
      ),
    disbursement_date: date,
    installments: z.number().int().min(1).max(120),
    double_months: z
      .array(z.number().int().min(1).max(12))
      .max(12)
      .refine(
        (values) => new Set(values).size === values.length,
        "No repitas meses dobles.",
      )
      .default([]),
  })
  .strict();

const fail = (message) => {
  throw Object.assign(new Error(message), { status: 400 });
};
// Exact positive rational rounding, half up. No binary floating point money arithmetic.
const round = (numerator, denominator) =>
  Number((2n * numerator + denominator) / (2n * denominator));

export function calculateSchedule(raw) {
  const input = scheduleInput.parse(raw);
  const [year, month, day] = input.disbursement_date.split("-").map(Number);
  const rows = Array.from({ length: input.installments }, (_, index) => {
    const dueMonth = new Date(Date.UTC(year, month + index, 1))
      .toISOString()
      .slice(0, 7);
    if (dueMonth > "2099-12")
      fail("El cronograma debe terminar antes del año 2100.");
    const double = input.double_months.includes(Number(dueMonth.slice(5)));
    return {
      installment_number: index + 1,
      due_date: monthDate(dueMonth, day),
      is_double: double,
      weight: double ? 2 : 1,
    };
  });
  const rateBasisPoints = BigInt(
    Math.round(input.total_interest_percent * 100),
  );
  const interest = round(
    BigInt(input.principal_cents) * rateBasisPoints,
    10000n,
  );
  const total = input.principal_cents + interest;
  const units = rows.reduce((sum, row) => sum + row.weight, 0);
  // Round the common quota down; the final quota receives the remaining cents.
  // Rounding it up can overpay the entire contract before its last small quota.
  const base = Number(BigInt(total) / BigInt(units));
  let paid = 0,
    allocatedInterest = 0,
    balance = input.principal_cents;
  const schedule = rows.map(({ weight, ...row }, index) => {
    const payment = index === rows.length - 1 ? total - paid : base * weight;
    const cumulativeInterest = round(
      BigInt(paid + payment) * BigInt(interest),
      BigInt(total),
    );
    const rowInterest = cumulativeInterest - allocatedInterest;
    const amortization = payment - rowInterest;
    if (
      payment <= 0 ||
      payment > 100000000 ||
      amortization <= 0 ||
      amortization > balance
    )
      fail(
        "El capital y el plazo no permiten cuotas válidas de al menos un céntimo de amortización. Ajusta los datos.",
      );
    const opening = balance;
    balance -= amortization;
    paid += payment;
    allocatedInterest = cumulativeInterest;
    return {
      ...row,
      opening_balance_cents: opening,
      interest_cents: rowInterest,
      amortization_cents: amortization,
      amount_cents: payment,
      closing_balance_cents: balance,
    };
  });
  if (balance !== 0 || paid !== total || allocatedInterest !== interest)
    fail("No se pudo cerrar el cronograma.");
  return {
    calculation_method: "total-interest-v1",
    principal_cents: input.principal_cents,
    total_interest_percent: input.total_interest_percent,
    interest_total_cents: interest,
    total_cents: total,
    base_installment_cents: base,
    schedule,
  };
}
