import { createPaymentSummary } from "../../shared/payment-summary.mjs";
import type { Bill } from "../types";
export async function downloadPaymentSummary(bills: Bill[], month: string) {
  const bytes = await createPaymentSummary(bills, month);
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `clara-resumen-pagos-${month}.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
