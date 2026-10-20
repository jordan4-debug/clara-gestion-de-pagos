import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import {
  createPaymentSummary,
  summaryTotals,
} from "../shared/payment-summary.mjs";

test("PDF summary keeps cents exact and separates paid, pending and undefined amounts", () => {
  assert.deepEqual(
    summaryTotals([
      {
        amount_cents: 10000,
        paid_cents: 10000,
        remaining_cents: 0,
        status: "Pagado",
      },
      {
        amount_cents: 8000,
        paid_cents: 1000,
        remaining_cents: 7000,
        status: "Vencido",
      },
      {
        amount_cents: null,
        paid_cents: 0,
        remaining_cents: null,
        status: "Por definir",
      },
      {
        amount_cents: 10,
        paid_cents: 0,
        remaining_cents: 10,
        status: "Pendiente",
      },
      {
        amount_cents: 20,
        paid_cents: 0,
        remaining_cents: 20,
        status: "Pendiente",
      },
    ]),
    { total: 18030, paid: 11000, pending: 7030, undefined: 1, overdue: 1 },
  );
});

test("PDF downloads are valid landscape A4 files and handle an empty month", async () => {
  const bytes = await createPaymentSummary(
    [],
    "2026-10",
    new Date("2026-10-20T18:00:00Z"),
  );
  assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), "%PDF-");
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  assert.equal(pdf.getTitle(), "Clara - Resumen de pagos 2026-10");
  assert.ok(pdf.getPage(0).getWidth() > pdf.getPage(0).getHeight());
  assert.equal(pdf.getAuthor(), "Clara Gestión de Pagos");
});

test("Long names, accents and unsupported symbols cannot break multipage PDF exports", async () => {
  const bills = Array.from({ length: 120 }, (_, id) => ({
    id,
    month: "2026-10",
    title: `${id} - Préstamo y declaración mensual ${"nombre extenso ".repeat(8)} 😀`,
    supplier: "Entidad de Trujillo - " + "Texto extenso ".repeat(5),
    due_date: "2026-10-18",
    last_payment_date: id % 2 ? null : "2026-10-19",
    amount_cents: 8000,
    paid_cents: id % 2 ? 0 : 8000,
    remaining_cents: id % 2 ? 8000 : 0,
    status: id % 2 ? "Vencido" : "Pagado",
  }));
  const bytes = await createPaymentSummary(bills, "2026-10");
  const pdf = await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount() > 5);
  assert.ok(bytes.length < 1000000);
  const futureOnly = await createPaymentSummary(
    [{ ...bills[0], month: "2026-11" }],
    "2026-10",
  );
  assert.equal((await PDFDocument.load(futureOnly)).getPageCount(), 1);
});
