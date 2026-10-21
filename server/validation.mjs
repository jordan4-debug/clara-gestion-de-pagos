import { z } from "zod";
import { receiptError } from "../shared/expenses.mjs";
import { today, validDate } from "./domain.mjs";
export const cents = z.number().int().positive().max(100000000);
export const date = z
  .string()
  .refine(
    (value) =>
      validDate(value) && value >= "1900-01-01" && value <= "2099-12-31",
    "Ingresa una fecha válida entre 1900 y 2099.",
  );
export const month = z.string().regex(/^(19|20)\d{2}-(0[1-9]|1[0-2])$/);
export const paymentMethods = [
  "Transferencia",
  "Yape",
  "Plin",
  "Ventanilla",
  "Otro",
  "Efectivo",
];
export const receiptIdentity = z
  .object({
    invoice_number: z.string().min(1).max(60),
    receipt_format: z.enum(["numeric", "alphanumeric"]).default("alphanumeric"),
  })
  .superRefine((x, ctx) => {
    const error = receiptError(x.invoice_number, x.receipt_format);
    if (error)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["invoice_number"],
        message: error,
      });
  });
export const paymentMethod = z.enum(paymentMethods);
export const billInput = z.object({
  title: z.string().trim().min(2).max(120),
  supplier_id: z.number().int().positive(),
  amount_cents: cents.nullable(),
  due_date: date,
  category: z
    .enum([
      "Servicios",
      "Proveedores",
      "Impuestos",
      "Alquiler",
      "Préstamos",
      "Otros",
    ])
    .optional(),
  invoice_number: z.string().max(60).optional(),
  receipt_format: z.enum(["numeric", "alphanumeric"]).optional(),
  issued_date: date.optional(),
  service_reference: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(2000).default(""),
});
export const supplierInput = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.enum([
    "Servicios",
    "Proveedores",
    "Impuestos",
    "Alquiler",
    "Préstamos",
    "Otros",
  ]),
  reference: z.string().trim().max(160).default(""),
  receipt_format: z.enum(["numeric", "alphanumeric"]).default("alphanumeric"),
});
export const templateInput = z.object({
  title: z.string().trim().min(2).max(120),
  supplier_id: z.number().int().positive(),
  amount_cents: cents.nullable(),
  day: z.number().int().min(1).max(31),
});
export const receiptInput = z.object({
  name: z.string().min(1).max(160),
  mime: z.enum(["image/png", "image/jpeg", "application/pdf"]),
  base64: z.string().min(8).max(6990600),
});
export const paymentInput = z.object({
  amount_cents: cents,
  payment_date: date.default(() => today()),
  method: paymentMethod,
  operation: z.string().trim().min(3).max(100),
  receipt: receiptInput,
  cash_holder_id: z.number().int().positive().nullable().optional(),
  funding_source: z.enum(["manager_funds", "other_funds"]).optional(),
});
export function decodeReceipt(receipt) {
  const content = Buffer.from(receipt.base64, "base64");
  const signatures = {
    "application/pdf": content.subarray(0, 5).toString() === "%PDF-",
    "image/png": content
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    "image/jpeg":
      content[0] === 255 && content[1] === 216 && content[2] === 255,
  };
  if (content.length > 5 * 1024 * 1024 || !signatures[receipt.mime])
    throw Object.assign(
      new Error("Adjunta un PDF, PNG o JPG válido, de hasta 5 MB."),
      {
        status: 400,
      },
    );
  return content;
}
