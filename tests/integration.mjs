import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:8788";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw new Error("Estas pruebas solo generan datos ficticios en localhost.");
const proof = {
  name: "ficticio.pdf",
  mime: "application/pdf",
  base64: Buffer.from("%PDF-1.4\nDocumento ficticio sin valor fiscal").toString(
    "base64",
  ),
};
function client() {
  let cookie = "",
    csrf = "";
  return async (path, method = "GET", body, extra = {}) => {
    const r = await fetch(base + "/api" + path, {
      method,
      headers: {
        Origin: base,
        Cookie: cookie,
        "X-CSRF-Token": csrf,
        "Content-Type": "application/json",
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (r.headers.get("set-cookie"))
      cookie = r.headers.get("set-cookie").split(";")[0];
    const data = r.headers.get("content-type")?.includes("json")
      ? await r.json()
      : await r.text();
    if (data.csrf) csrf = data.csrf;
    return { status: r.status, data };
  };
}
const manager = client(),
  assistant = client(),
  visitor = client();
assert.equal((await visitor("/dashboard")).status, 401);
for (const [call, role] of [
  [manager, "owner"],
  [assistant, "assistant"],
])
  assert.equal((await call("/auth/demo", "POST", { role })).status, 200);
assert.equal((await manager("/auth/me")).data.user.name, "Gerente de demo");
assert.equal(
  (
    await manager(
      "/settings",
      "PUT",
      { reminder_days: 3, recipient: "both" },
      { "X-CSRF-Token": "incorrecto" },
    )
  ).status,
  403,
);
for (const [path, method] of [
  ["/finance", "GET"],
  ["/bills/1/simulate", "POST"],
  ["/bills/1/checkout", "POST"],
])
  assert.equal(
    (await assistant(path, method, method === "POST" ? {} : undefined)).status,
    410,
  );
for (const call of [manager, assistant]) {
  const loans = await call("/loans");
  assert.equal(loans.status, 200);
  assert.ok(Array.isArray(loans.data));
}
const identity = String(Date.now()),
  input = {
    title: "Recibo ficticio HTTP " + identity,
    supplier_id: 2,
    invoice_number: identity,
    receipt_format: "numeric",
    amount_cents: 12345,
    due_date: "2027-12-20",
    invoice: proof,
  };
assert.equal(
  (await assistant("/bills", "POST", { ...input, invoice_number: "12A" }))
    .status,
  400,
);
const made = await assistant("/bills", "POST", input);
assert.equal(made.status, 201, JSON.stringify(made.data));
assert.equal((await assistant("/bills", "POST", input)).status, 409);
const id = made.data.id;
assert.equal((await manager(`/bills/${id}`, "PATCH", input)).status, 403);
assert.equal(
  (await assistant(`/bills/${id}`, "PATCH", { ...input, amount_cents: 12346 }))
    .status,
  409,
);
const detail = (await manager(`/bills/${id}`)).data;
assert.equal(detail.invoice_number, identity);
assert.equal(detail.amount_cents, 12345);
const cashBefore = (await manager("/cash")).data;
const payment = {
  amount_cents: 12345,
  method: "Transferencia",
  operation: "HTTP-" + identity,
  receipt: proof,
  payment_date: "2026-10-19",
};
assert.equal(
  (await manager(`/bills/${id}/payments`, "POST", payment)).status,
  201,
);
const paid = (await assistant(`/bills/${id}`)).data;
assert.equal(paid.status, "Pagado");
assert.equal(paid.remaining_cents, 0);
assert.equal(paid.last_payment_date, "2026-10-19");
assert.notEqual(paid.invoice_receipt_id, paid.payments[0].receipt_id);
assert.equal(
  (await assistant(`/bills/${id}/payments`, "POST", payment)).status,
  409,
);
assert.equal(
  (await visitor(`/receipts/${paid.invoice_receipt_id}`)).status,
  401,
);
assert.equal(
  (await manager(`/receipts/${paid.payments[0].receipt_id}`)).status,
  200,
);
assert.equal(
  (await manager("/cash")).data.balance_cents,
  cashBefore.balance_cents,
);
assert.equal((await assistant("/export")).status, 403);
assert.equal((await assistant("/team")).status, 403);
assert.equal((await assistant("/auth/logout", "POST", {})).status, 200);
assert.equal((await assistant("/dashboard")).status, 401);
console.log(
  "PASS HTTP: sesión, permisos, recibo numérico, duplicados, precisión, fechas, pago declarado, comprobantes protegidos, efectivo independiente y rutas retiradas.",
);
