import { z } from "zod";
import { validDate } from "./domain.mjs";
export const cents = z.number().int().positive().max(100000000);
export const date = z.string().refine(validDate, "Fecha inválida.");
export const month = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
export const paymentMethods = [
  "Portal de entidad",
  "Transferencia",
  "Yape",
  "Plin",
  "Ventanilla",
  "Otro",
  "Efectivo",
];
export const paymentMethod = z.enum(paymentMethods);
export const billInput = z.object({
  title: z.string().trim().min(2).max(120),
  supplier_id: z.number().int().positive(),
  amount_cents: cents.nullable(),
  due_date: date,
  notes: z.string().trim().max(2000).default(""),
});
export const supplierInput = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.enum([
    "Servicios",
    "Impuestos",
    "Alquiler",
    "Préstamos",
    "Otros",
  ]),
  bank: z.string().trim().max(100).default(""),
  account: z.string().trim().max(50).default(""),
  reference: z.string().trim().max(160).default(""),
  portal: z
    .string()
    .max(300)
    .refine((x) => !x || /^https:\/\//i.test(x), "El portal debe usar HTTPS.")
    .default(""),
  channel: z.enum(["external", "culqi"]).default("external"),
  payment_gateway: z.enum(["portal", "manual", "izipay"]).optional(),
  payment_url: z
    .string()
    .max(300)
    .refine((x) => !x || /^https:\/\//i.test(x), "La pasarela debe usar HTTPS.")
    .optional(),
  payment_methods: z.array(paymentMethod).min(1).max(6).optional(),
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
  base64: z.string().min(8).max(4200000),
});
export const paymentInput = z.object({
  amount_cents: cents,
  method: paymentMethod,
  operation: z.string().trim().min(3).max(100),
  receipt: receiptInput,
  cash_holder_id: z.number().int().positive().nullable().optional(),
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
  if (content.length > 3 * 1024 * 1024 || !signatures[receipt.mime])
    throw Object.assign(
      new Error("Adjunta un PDF, PNG o JPG válido, de hasta 3 MB."),
      {
        status: 400,
      },
    );
  return content;
}
