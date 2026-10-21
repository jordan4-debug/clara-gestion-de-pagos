import { activeExpense } from "./expenses.mjs";
import { comparableReference } from "../shared/expenses.mjs";

export const variationDefaults = {
  variation_enabled: true,
  variation_percent: 20,
  variation_min_cents: 1000,
};
export function variationConfig(settings = {}) {
  return {
    variation_enabled:
      typeof settings.variation_enabled === "boolean"
        ? settings.variation_enabled
        : variationDefaults.variation_enabled,
    variation_percent:
      Number.isInteger(settings.variation_percent) &&
      settings.variation_percent >= 1 &&
      settings.variation_percent <= 1000
        ? settings.variation_percent
        : variationDefaults.variation_percent,
    variation_min_cents:
      Number.isSafeInteger(settings.variation_min_cents) &&
      settings.variation_min_cents >= 0 &&
      settings.variation_min_cents <= 100000000
        ? settings.variation_min_cents
        : variationDefaults.variation_min_cents,
  };
}
const ordinary = (state, bill) =>
  activeExpense(state, bill) &&
  !bill.loan_id &&
  (bill.category ||
    state.suppliers.find((s) => s.id === bill.supplier_id)?.category) !==
    "Préstamos";
const backed = (state, bill) =>
  !!bill.invoice_number &&
  !!bill.invoice_receipt_id &&
  state.receipts.some((r) => r.id === bill.invoice_receipt_id);
const positiveAmount = (bill) =>
  Number.isSafeInteger(bill.amount_cents) && bill.amount_cents > 0;

export function billVariation(state, bill) {
  if (!ordinary(state, bill)) return null;
  const base = {
    bill_id: bill.id,
    title: bill.title,
    supplier:
      state.suppliers.find((s) => s.id === bill.supplier_id)?.name || "Entidad",
    month: bill.month,
    current_cents: bill.amount_cents,
    service_reference: bill.service_reference || "",
    current_receipt_id: bill.invoice_receipt_id || null,
  };
  const incomplete = (reason) => ({ ...base, status: reason, alert: false });
  const reference = comparableReference(bill.service_reference);
  if (!reference) return incomplete("missing_reference");
  if (!positiveAmount(bill)) return incomplete("undefined_amount");
  if (!backed(state, bill)) return incomplete("missing_original");
  const sameService = state.bills.filter(
    (other) =>
      ordinary(state, other) &&
      other.supplier_id === bill.supplier_id &&
      comparableReference(other.service_reference) === reference,
  );
  if (sameService.filter((other) => other.month === bill.month).length !== 1)
    return incomplete("ambiguous_period");
  const earlier = sameService.filter((other) => other.month < bill.month);
  const previousMonth = earlier
    .map((other) => other.month)
    .sort()
    .at(-1);
  if (!previousMonth) return incomplete("no_previous");
  const previousBills = earlier.filter(
    (other) => other.month === previousMonth,
  );
  if (previousBills.length !== 1) return incomplete("ambiguous_period");
  const previous = previousBills[0];
  if (!positiveAmount(previous) || !backed(state, previous))
    return incomplete("incomplete_previous");
  const config = variationConfig(state.settings);
  const difference = bill.amount_cents - previous.amount_cents;
  return {
    ...base,
    status: "compared",
    previous_bill_id: previous.id,
    previous_month: previous.month,
    previous_cents: previous.amount_cents,
    previous_receipt_id: previous.invoice_receipt_id,
    difference_cents: difference,
    percent: Math.round((difference * 10000) / previous.amount_cents) / 100,
    alert:
      config.variation_enabled &&
      difference > 0 &&
      difference >= config.variation_min_cents &&
      difference * 100 >= previous.amount_cents * config.variation_percent,
  };
}
export function variationSummary(state, month) {
  const comparisons = state.bills
    .filter((bill) => bill.month === month)
    .map((bill) => billVariation(state, bill))
    .filter(Boolean);
  return {
    ...variationConfig(state.settings),
    total: comparisons.length,
    compared: comparisons.filter((entry) => entry.status === "compared").length,
    alerts: comparisons
      .filter((entry) => entry.alert)
      .sort(
        (a, b) =>
          b.difference_cents - a.difference_cents || a.bill_id - b.bill_id,
      ),
    unavailable: comparisons.filter((entry) => entry.status !== "compared"),
  };
}
