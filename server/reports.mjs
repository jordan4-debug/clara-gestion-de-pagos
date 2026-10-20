import { recordedPayment, recordMonth } from "./expenses.mjs";
import { dashboard } from "./cloud-state.mjs";
const limaMonth = (date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date(date))
    .slice(0, 7);
export function report(state, selected) {
  const summary = dashboard(state, selected, "owner");
  const recorded = state.payments.filter(
    (p) => recordedPayment(state, p) && recordMonth(p) === selected,
  );
  const categories = [...new Set(state.suppliers.map((s) => s.category))].map(
    (category) => {
      const bills = summary.bills.filter((b) => b.category === category);
      const payments = recorded.filter((p) => {
        const bill = state.bills.find((b) => b.id === p.bill_id);
        return (
          state.suppliers.find((s) => s.id === bill?.supplier_id)?.category ===
          category
        );
      });
      return {
        category,
        count: bills.length,
        pending: bills.reduce((sum, b) => sum + (b.remaining_cents || 0), 0),
        recorded: payments.reduce((sum, p) => sum + p.amount_cents, 0),
      };
    },
  );
  const trend = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(selected + "-15T12:00:00Z");
    d.setUTCMonth(d.getUTCMonth() - 5 + i);
    const month = d.toISOString().slice(0, 7);
    return {
      month,
      recorded: state.payments
        .filter((p) => recordedPayment(state, p) && recordMonth(p) === month)
        .reduce((sum, p) => sum + p.amount_cents, 0),
    };
  });
  return {
    month: selected,
    totals: summary.totals,
    categories,
    trend,
    bills: summary.bills,
    recorded_count: recorded.length,
    verified_count: recorded.filter((p) => p.review_status === "verified")
      .length,
  };
}
