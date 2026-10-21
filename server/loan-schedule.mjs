import { z } from "zod";
import Decimal from "decimal.js";
import { cents, date } from "./validation.mjs";
import { monthDate } from "./domain.mjs";

// Isolated context: every financial operation uses base-ten Decimal arithmetic.
const D = Decimal.clone({ precision: 80, rounding: Decimal.ROUND_HALF_UP });
export const scheduleInput = z
  .object({
    principal_cents: cents,
    annual_interest_percent: z
      .string({
        invalid_type_error:
          "Ingresa la tasa anual como decimal, por ejemplo 17.02.",
      })
      .max(16)
      .regex(
        /^\d+(?:\.\d{1,2})?$/,
        "La tasa anual admite números y hasta dos decimales.",
      )
      .refine(
        (value) =>
          /^\d+(?:\.\d{1,2})?$/.test(value) && new D(value).lte("1000"),
        "La tasa anual debe estar entre 0 y 1000 %.",
      ),
    first_due_date: date,
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
const asCents = (value) => {
  if (
    !value.isInteger() ||
    !value.isFinite() ||
    value.isNegative() ||
    value.gt(Number.MAX_SAFE_INTEGER)
  )
    fail("El cálculo no se puede representar en céntimos exactos.");
  // Only exact, safe integer cents leave the Decimal context, for JSON persistence.
  return value.toNumber();
};
export function calculateSchedule(raw) {
  const input = scheduleInput.parse(raw);
  const [year, month, day] = input.first_due_date.split("-").map(Number);
  const rows = Array.from({ length: input.installments }, (_, index) => {
    const dueMonth = new Date(Date.UTC(year, month - 1 + index, 1))
      .toISOString()
      .slice(0, 7);
    if (dueMonth > "2099-12")
      fail("El cronograma debe terminar antes del año 2100.");
    return {
      installment_number: index + 1,
      due_date: monthDate(dueMonth, day),
      is_double: input.double_months.includes(Number(dueMonth.slice(5))),
    };
  });
  // Business rule from the BCP teaching example: nominal annual percentage / 12.
  // 36,000 * (17.02 / 100 / 12) = 510.60 for the first month's interest.
  const annual = new D(input.annual_interest_percent);
  const rate = annual.div("1200");
  // Exact rational annuity coefficients protect half-cent boundaries even for
  // recurring monthly rates. r = annual basis points / 120000; 1+r = q/b.
  const b = 120000n,
    q = b + BigInt(annual.mul("100").toFixed(0));
  const denominator = q ** BigInt(rows.length);
  let bPower = b,
    qPower = q ** BigInt(rows.length - 1),
    discountedNumerator = 0n;
  for (const row of rows) {
    discountedNumerator += (row.is_double ? 2n : 1n) * bPower * qPower;
    bPower *= b;
    qPower /= q;
  }
  // Weighted annuity; with no double months this is P*r/(1-(1+r)^-n).
  // Weights preserve the agreed term when some payments are double.
  const numerator = BigInt(input.principal_cents) * denominator;
  const base = new D(
    (
      (2n * numerator + discountedNumerator) /
      (2n * discountedNumerator)
    ).toString(),
  );
  let balance = new D(input.principal_cents),
    interestTotal = new D("0"),
    total = new D("0");
  const schedule = rows.map((row, index) => {
    // Multiply before dividing: no recurring-rate approximation enters the rounding.
    const interest = balance.mul(annual).div("1200").toDecimalPlaces(0);
    const payment =
      index === rows.length - 1
        ? balance.plus(interest)
        : base.mul(row.is_double ? "2" : "1");
    const amortization = payment.minus(interest);
    if (
      payment.lte("0") ||
      payment.gt("100000000") ||
      amortization.lte("0") ||
      amortization.gt(balance)
    )
      fail(
        "El capital, la tasa y el plazo no permiten cuotas con amortización positiva al céntimo. Ajusta las condiciones del préstamo.",
      );
    const opening = balance;
    balance = balance.minus(amortization);
    interestTotal = interestTotal.plus(interest);
    total = total.plus(payment);
    return {
      ...row,
      opening_balance_cents: asCents(opening),
      interest_cents: asCents(interest),
      amortization_cents: asCents(amortization),
      amount_cents: asCents(payment),
      closing_balance_cents: asCents(balance),
    };
  });
  if (
    !balance.isZero() ||
    !total.eq(new D(input.principal_cents).plus(interestTotal))
  )
    fail("No se pudo cerrar el cronograma.");
  return {
    calculation_method: "french-nominal-monthly-v1",
    rate_convention: "nominal-annual-divided-12",
    principal_cents: input.principal_cents,
    annual_interest_percent: new D(input.annual_interest_percent).toFixed(2),
    monthly_rate: rate.toString(),
    first_due_date: input.first_due_date,
    interest_total_cents: asCents(interestTotal),
    total_cents: asCents(total),
    base_installment_cents: asCents(base),
    schedule,
  };
}
