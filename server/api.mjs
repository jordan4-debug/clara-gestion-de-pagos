import { randomUUID } from "node:crypto";
import { authenticate } from "./auth.mjs";
import { z, ZodError } from "zod";
import { today, assertPayable } from "./domain.mjs";
import {
  billInput,
  supplierInput,
  paymentInput,
  decodeReceipt,
  cents,
  month,
  receiptInput,
  receiptIdentity,
} from "./validation.mjs";
import {
  readState,
  mutateState,
  decorate,
  addAudit,
  dashboard,
} from "./cloud-state.mjs";
import {
  reviewInput,
  reviewPayment,
  findPayment,
  assertCorrection,
  reviewQueue,
} from "./reviews.mjs";
import { report } from "./reports.mjs";
import { handleTeam } from "./team.mjs";
import { loanInput, createLoan, listLoans, archiveLoan } from "./loans.mjs";
import { calculateSchedule } from "./loan-schedule.mjs";
import { resetPresentation } from "./maintenance.mjs";

import {
  cashInput,
  cashPeople,
  cashView,
  addCash,
  spendCash,
} from "./cash.mjs";
import {
  activeExpense,
  assertEditable,
  assertReceipt,
  assertPaymentOperation,
  assertOriginal,
  publicSupplier,
} from "./expenses.mjs";

const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const json = (value, status = 200, headers = {}) =>
  Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
const owner = (session) => {
  if (session.role !== "owner") fail("Solo el gerente puede hacer esto.", 403);
};
const assistant = (session) => {
  if (session.role !== "assistant")
    fail("El asistente registra los recibos; el gerente supervisa.", 403);
};
const cap = (items, max) => {
  if (items.length >= max)
    fail("Se alcanzó el límite de registros de esta demostración.", 409);
};
const supplierExists = (state, id) => {
  if (!state.suppliers.some((s) => s.id === id))
    fail("El proveedor no existe.", 400);
};
const receiptSupplier = (state, input) => {
  supplierExists(state, input.supplier_id);
  const supplier = state.suppliers.find((s) => s.id === input.supplier_id);
  if (supplier.category === "Préstamos")
    fail(
      "Registra el contrato y sus cuotas desde Préstamos para evitar duplicar el cronograma.",
    );
  if (input.category !== undefined && input.category !== supplier.category)
    fail(
      "La categoría del recibo debe coincidir con la del proveedor o entidad. Vuelve a seleccionarlo para actualizarla.",
    );
  return supplier;
};
const findBill = (state, id) => {
  const bill = state.bills.find((b) => b.id === id);
  if (!bill) fail("Pago no encontrado.", 404);
  if (!activeExpense(state, bill))
    fail("Esta obligación fue retirada junto con su préstamo.", 404);
  return bill;
};

async function body(request) {
  if (Number(request.headers.get("Content-Length") || 0) > 7100000)
    fail("El archivo es demasiado grande.", 413);
  const content = await request.text();
  if (content.length > 7100000) fail("El archivo es demasiado grande.", 413);
  try {
    return JSON.parse(content);
  } catch {
    fail("El contenido enviado no es válido.");
  }
}

export async function handleRequest(request, env) {
  try {
    const url = new URL(request.url),
      path = url.pathname.slice(4),
      method = request.method;
    if (method === "GET" && path === "/public-config")
      return json({ demo: env.DEMO_MODE === "true", cloud: true });
    if (method === "GET" && path === "/health") return json({ ok: true });
    if (!env.DB || !env.BUCKET)
      fail("El almacenamiento no está disponible.", 503);
    const auth = await authenticate(request, env, path);
    if (auth.response) return auth.response;
    const { session, user } = auth;
    const actor = user.name;
    if (
      /^\/(?:finance|templates|attempts)(?:\/|$)/.test(path) ||
      path === "/months/generate" ||
      (path === "/settings" && method !== "GET") ||
      /\/(?:simulate|checkout|voucher)$/.test(path)
    )
      fail(
        "Esta función está retirada. Clara registra gastos y pagos; no procesa dinero ni créditos.",
        410,
      );
    if (path === "/team" || /^\/team\/\d+$/.test(path)) {
      owner(session);
      return await handleTeam(
        request,
        env,
        user,
        path,
        await (method === "GET" ? Promise.resolve(null) : body(request)),
      );
    }
    if (method === "GET") {
      const { state } = await readState(env.DB);
      if (path === "/loans") return json(listLoans(state));
      if (path === "/cash")
        return json(
          cashView(
            state,
            month.parse(url.searchParams.get("month") || today().slice(0, 7)),
            user,
            await cashPeople(env.DB, user),
          ),
        );

      if (path === "/reviews") {
        const queue = reviewQueue(
          state,
          month.parse(url.searchParams.get("month") || today().slice(0, 7)),
        );
        return json(
          user.role === "owner"
            ? queue
            : queue.filter((p) => !p.actor_id || p.actor_id === user.id),
        );
      }
      if (path === "/reports") {
        owner(session);
        return json(
          report(
            state,
            month.parse(url.searchParams.get("month") || today().slice(0, 7)),
          ),
        );
      }
      if (path === "/export") {
        owner(session);
        return json({ schema_version: 1, state });
      }
      if (path === "/dashboard") {
        const selected = month.parse(
          url.searchParams.get("month") || today().slice(0, 7),
        );
        const data = dashboard(state, selected, session.role);
        const cash = cashView(
          state,
          selected,
          user,
          await cashPeople(env.DB, user),
        );
        return json({
          ...data,
          cash_summary: { ...cash.totals, balance_cents: cash.balance_cents },
        });
      }
      if (path === "/suppliers")
        return json(
          state.suppliers
            .map(publicSupplier)
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      if (path === "/activity") return json(state.activity.slice(0, 300));
      if (path === "/settings") return json({ mode: "administrative" });
      if (path === "/attempts") {
        owner(session);
        return json([]);
      }
      let match = path.match(/^\/bills\/(\d+)$/);
      if (match) {
        const bill = findBill(state, Number(match[1]));
        return json({
          ...decorate(state, bill),
          payments: state.payments
            .map((p) => ({
              ...p,
              destination: p.destination
                ? {
                    supplier: p.destination.supplier,
                    reference: p.destination.reference,
                  }
                : undefined,
            }))
            .filter((p) => p.bill_id === bill.id)
            .sort((a, b) => b.id - a.id),
        });
      }
      match = path.match(/^\/receipts\/(\d+)$/);
      if (match) {
        const receipt = state.receipts.find((r) => r.id === Number(match[1]));
        if (!receipt) fail("Comprobante no encontrado.", 404);
        const object = await env.BUCKET.get(receipt.key);
        if (!object) fail("No se pudo recuperar el archivo.", 404);
        return new Response(object.body, {
          headers: {
            "Content-Type": receipt.mime,
            "Content-Disposition": `inline; filename="${receipt.name.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
            "Cache-Control": "private, no-store",
            "Content-Security-Policy": "sandbox",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      fail("Ruta no encontrada.", 404);
    }
    const input = await body(request);
    if (method === "POST" && path === "/maintenance/reset-records")
      return json(await resetPresentation(env, user, input));
    const loanAction = path.match(/^\/loans\/(\d+)\/(archive|restore)$/);
    if (method === "POST" && loanAction) {
      owner(session);
      return json(
        await mutateState(env.DB, (state) =>
          archiveLoan(
            state,
            Number(loanAction[1]),
            user,
            loanAction[2] === "restore",
          ),
        ),
      );
    }
    if (method === "POST" && path === "/loans/preview") {
      return json(calculateSchedule(input));
    }
    if (method === "POST" && path === "/loans") {
      assistant(session);
      const data = loanInput.parse(input);
      return json(
        await mutateState(env.DB, (state) => createLoan(state, data, user)),
        201,
      );
    }
    if (method === "POST" && path === "/cash") {
      const data = cashInput.parse(input),
        people = await cashPeople(env.DB, user);
      if (
        !people.some(
          (p) =>
            p.id === data.holder_id && (data.kind === "return" || p.active),
        )
      )
        fail("Selecciona un asistente activo.");
      await mutateState(env.DB, (state) => addCash(state, data, user));
      return json({ ok: true }, 201);
    }
    let documentMatch = path.match(/^\/bills\/(\d+)\/document$/);
    if (method === "PATCH" && documentMatch) {
      const identity = receiptIdentity.parse(input);
      await mutateState(env.DB, (s) => {
        const bill = findBill(s, Number(documentMatch[1]));
        if (!bill.invoice_receipt_id || bill.invoice_number)
          fail("El recibo no admite este cambio.", 409);
        if (user.role !== "owner") assertEditable(bill, user);
        assertReceipt(
          s,
          bill,
          identity.invoice_number,
          identity.receipt_format,
        );
        Object.assign(bill, identity);
        addAudit(s, actor, "Número de recibo completado", bill.title);
      });
      return json({ ok: true });
    }
    if (method === "POST" && documentMatch) {
      const data = z
          .object({
            receipt: receiptInput,
            invoice_number: z.string().min(1).max(60),
            receipt_format: z
              .enum(["numeric", "alphanumeric"])
              .default("alphanumeric"),
          })
          .parse(input),
        id = Number(documentMatch[1]),
        content = decodeReceipt(data.receipt);
      const { state } = await readState(env.DB);
      if (user.role !== "owner") assertEditable(findBill(state, id), user);
      assertReceipt(
        state,
        findBill(state, id),
        data.invoice_number,
        data.receipt_format,
      );
      if (findBill(state, id).invoice_receipt_id)
        fail("El recibo original ya está archivado y no se reemplaza.", 409);
      cap(state.receipts, 100);
      const key = `documents/${randomUUID()}`;
      await env.BUCKET.put(key, content, {
        httpMetadata: { contentType: data.receipt.mime },
      });
      try {
        await mutateState(env.DB, (state) => {
          const bill = findBill(state, id);
          if (user.role !== "owner") assertEditable(bill, user);
          assertReceipt(state, bill, data.invoice_number, data.receipt_format);
          if (bill.invoice_receipt_id)
            fail("El recibo original ya está archivado.", 409);
          cap(state.receipts, 100);
          const receipt_id = state.next.receipts++;
          state.receipts.push({
            id: receipt_id,
            key,
            name: data.receipt.name,
            mime: data.receipt.mime,
          });
          bill.invoice_receipt_id = receipt_id;
          bill.invoice_name = data.receipt.name;
          bill.invoice_number = data.invoice_number;
          bill.receipt_format = data.receipt_format;
          if (user.role === "assistant") bill.created_by_id ||= user.id;
          bill.invoice_uploaded_by_id = user.id;
          bill.invoice_uploaded_by = user.name;
          addAudit(state, actor, "Recibo original archivado", bill.title);
        });
      } catch (e) {
        await env.BUCKET.delete(key);
        throw e;
      }
      return json({ ok: true }, 201);
    }
    let reviewMatch = path.match(/^\/payments\/(\d+)\/review$/);
    if (method === "POST" && reviewMatch) {
      owner(session);
      const data = reviewInput.parse(input);
      await mutateState(env.DB, (state) =>
        reviewPayment(state, Number(reviewMatch[1]), data, user),
      );
      return json({ ok: true });
    }
    reviewMatch = path.match(/^\/payments\/(\d+)\/correction$/);
    if (method === "POST" && reviewMatch) {
      const data = z
        .object({
          receipt: receiptInput,
          note: z.string().trim().min(5).max(1000),
          revision: z.number().int().nonnegative(),
        })
        .parse(input);
      const id = Number(reviewMatch[1]),
        content = decodeReceipt(data.receipt);
      const { state } = await readState(env.DB);
      assertCorrection(findPayment(state, id), data.revision, user);
      cap(state.receipts, 100);
      const key = `receipts/${randomUUID()}`;
      await env.BUCKET.put(key, content, {
        httpMetadata: { contentType: data.receipt.mime },
      });
      try {
        await mutateState(env.DB, (state) => {
          const p = findPayment(state, id);
          assertCorrection(p, data.revision, user);
          cap(state.receipts, 100);
          const receipt_id = state.next.receipts++;
          state.receipts.push({
            id: receipt_id,
            key,
            name: data.receipt.name,
            mime: data.receipt.mime,
          });
          Object.assign(p, {
            receipt_id,
            receipt_name: data.receipt.name,
            review_status: "pending",
            review_note: "",
            reviewed_by: null,
            reviewed_at: null,
            review_revision: (p.review_revision || 0) + 1,
          });
          (p.review_events ||= []).push({
            status: "resubmitted",
            note: data.note,
            actor: user.name,
            actor_id: user.id,
            receipt_id,
            created_at: new Date().toISOString(),
          });
          addAudit(
            state,
            actor,
            "Comprobante corregido",
            `Abono #${id} · ${data.note}`,
          );
        });
        return json({ ok: true });
      } catch (error) {
        await env.BUCKET.delete(key);
        throw error;
      }
    }
    if (path === "/suppliers" || /^\/suppliers\/\d+$/.test(path)) {
      if (!(method === "POST" && path === "/suppliers")) assistant(session);
      const x = supplierInput.parse(input);
      if (
        [
          "bank",
          "account",
          "portal",
          "payment_gateway",
          "payment_url",
          "channel",
          "payment_methods",
        ].some((key) => input[key])
      )
        fail(
          "Solo se configura la entidad y el formato del recibo. No se solicitan datos bancarios ni pasarelas.",
          400,
        );
      if (!["POST", "PUT"].includes(method)) fail("Método no permitido.", 405);
      const id = Number(path.split("/")[2]);
      return json(
        await mutateState(env.DB, (state) => {
          if (method === "POST" && path === "/suppliers") {
            cap(state.suppliers, 100);
            const normalized = x.name
              .normalize("NFKC")
              .toLocaleLowerCase("es-PE")
              .replace(/\s+/g, " ");
            if (
              state.suppliers.some(
                (s) =>
                  s.name
                    .normalize("NFKC")
                    .trim()
                    .toLocaleLowerCase("es-PE")
                    .replace(/\s+/g, " ") === normalized,
              )
            )
              fail(
                "Esta entidad ya existe. Selecciónala en la lista para evitar duplicados.",
                409,
              );
            const supplier = {
              id: state.next.suppliers++,
              ...x,
              created_by_id: user.id,
            };
            state.suppliers.push(supplier);
            addAudit(state, actor, "Proveedor registrado", x.name);
            return publicSupplier(supplier);
          } else if (method === "PUT" && id) {
            const previous = state.suppliers.find((s) => s.id === id);
            if (!previous) fail("Proveedor no encontrado.", 404);
            Object.assign(previous, x);
          } else fail("Ruta no encontrada.", 404);
          addAudit(state, actor, "Proveedor guardado", x.name);
          return { ok: true };
        }),
      );
    }
    let match;
    match = path.match(/^\/bills\/(\d+)$/);
    if (
      (method === "POST" && path === "/bills") ||
      (method === "PATCH" && match)
    ) {
      assistant(session);
      const x = billInput.parse(input),
        id = match ? Number(match[1]) : null;
      if (
        x.issued_date &&
        (x.issued_date > today() || x.issued_date > x.due_date)
      )
        fail(
          "La fecha de emisión no puede ser futura ni posterior al vencimiento.",
        );
      let document = null,
        documentKey = null;
      if (!id) {
        document = receiptInput.parse(input.invoice);
        Object.assign(x, receiptIdentity.parse(input));
        if (x.amount_cents === null) fail("Ingresa el monto del recibo.");
        const content = decodeReceipt(document);
        const { state } = await readState(env.DB);
        const destination = receiptSupplier(state, x);
        assertReceipt(state, x, x.invoice_number, x.receipt_format);
        x.service_reference ||= destination.reference || "";
        cap(state.bills, 300);
        cap(state.receipts, 100);
        documentKey = `documents/${randomUUID()}`;
        await env.BUCKET.put(documentKey, content, {
          httpMetadata: { contentType: document.mime },
        });
      }
      try {
        return json(
          await mutateState(env.DB, (state) => {
            supplierExists(state, x.supplier_id);
            if (id) {
              const bill = findBill(state, id);
              const issued = x.issued_date ?? bill.issued_date;
              if (issued && (issued > today() || issued > x.due_date))
                fail(
                  "La fecha de emisión no puede ser futura ni posterior al vencimiento.",
                );
              assertEditable(bill, user);
              if (
                x.title !== bill.title ||
                (x.receipt_format !== undefined &&
                  x.receipt_format !== bill.receipt_format) ||
                (x.issued_date !== undefined &&
                  x.issued_date !== bill.issued_date) ||
                x.supplier_id !== bill.supplier_id ||
                (x.invoice_number !== undefined &&
                  x.invoice_number !== bill.invoice_number) ||
                (x.category !== undefined &&
                  x.category !==
                    (bill.category ||
                      state.suppliers.find((s) => s.id === bill.supplier_id)
                        .category)) ||
                (x.service_reference !== undefined &&
                  x.service_reference !== (bill.service_reference || ""))
              )
                fail(
                  "Solo se editan el vencimiento y las notas. Los datos del recibo se conservan.",
                  409,
                );
              if (bill.paid_cents === bill.amount_cents)
                fail("No se modifica una obligación pagada.", 409);
              if (
                bill.amount_cents !== null &&
                x.amount_cents !== bill.amount_cents
              )
                fail("El monto del pago creado no se puede modificar.", 409);
              if (bill.paid_cents > 0 && x.supplier_id !== bill.supplier_id)
                fail(
                  "No se cambia el proveedor de una obligación con abonos.",
                  409,
                );
              if (
                bill.loan_id &&
                (x.supplier_id !== bill.supplier_id ||
                  x.amount_cents !== bill.amount_cents)
              )
                fail(
                  "No se modifica el contrato ni el importe de una cuota de préstamo.",
                  409,
                );
              if (
                bill.loan_id &&
                state.loans?.find((loan) => loan.id === bill.loan_id)
                  ?.calculation_method &&
                x.due_date !== bill.due_date
              )
                fail(
                  "El vencimiento pertenece al cronograma calculado del préstamo.",
                  409,
                );
              Object.assign(bill, x, {
                created_by_id: bill.created_by_id || user.id,
                month: x.due_date.slice(0, 7),
                approval: "approved",
              });
            } else {
              const destination = receiptSupplier(state, x);
              assertReceipt(state, x, x.invoice_number, x.receipt_format);
              cap(state.bills, 300);
              cap(state.receipts, 100);
              const documentId = state.next.receipts++;
              state.receipts.push({
                id: documentId,
                key: documentKey,
                name: document.name,
                mime: document.mime,
              });
              state.bills.push({
                invoice_receipt_id: documentId,
                invoice_name: document.name,
                created_by: actor,
                created_by_id: user.id,
                id: state.next.bills++,
                ...x,
                category: destination.category,
                paid_cents: 0,
                month: x.due_date.slice(0, 7),
                template_id: null,
                approval: "approved",
              });
            }
            addAudit(
              state,
              actor,
              id ? "Pago actualizado" : "Pago creado",
              x.title,
            );
            return { id: id || state.next.bills - 1 };
          }),
          id ? 200 : 201,
        );
      } catch (e) {
        if (documentKey) await env.BUCKET.delete(documentKey);
        throw e;
      }
    }
    if (method === "POST" && /^\/bills\/\d+\/approval$/.test(path))
      fail("Los pagos ya no requieren autorización previa del gerente.", 410);
    match = path.match(/^\/bills\/(\d+)\/payments$/);
    if (method === "POST" && match) {
      const x = paymentInput.parse(input),
        content = decodeReceipt(x.receipt),
        id = Number(match[1]);
      // Validate before uploading; validate again inside the optimistic transaction.
      const { state } = await readState(env.DB);
      assertPayable(findBill(state, id), x.amount_cents);
      assertOriginal(state, findBill(state, id));
      assertPaymentOperation(state, x.operation);

      if (x.payment_date > today())
        fail("La fecha de pago no puede estar en el futuro.");
      // Legacy clients retain their old meaning; new clients declare the source
      // independently of the payment medium (cash, transfer or wallet).
      const funded = x.funding_source
        ? x.funding_source === "manager_funds"
        : x.method === "Efectivo" &&
          (user.role === "assistant" || x.cash_holder_id != null);
      if (funded && user.role === "owner" && x.cash_holder_id == null)
        fail("Selecciona al asistente cuyo fondo se utilizó.");
      if (!funded && x.cash_holder_id != null)
        fail(
          "Un pago con otros fondos no puede cargar dinero de un asistente.",
          403,
        );
      if (
        funded &&
        user.role === "assistant" &&
        x.cash_holder_id != null &&
        x.cash_holder_id !== user.id
      )
        fail("No puedes usar el fondo de otro asistente.", 403);
      if (
        funded &&
        user.role === "owner" &&
        x.cash_holder_id != null &&
        !(await cashPeople(env.DB, user)).some((p) => p.id === x.cash_holder_id)
      )
        fail("Asistente de efectivo no válido.", 403);
      cap(state.receipts, 100);
      const key = `demo-receipts/${randomUUID()}`;
      await env.BUCKET.put(key, content, {
        httpMetadata: { contentType: x.receipt.mime },
      });
      try {
        return json(
          await mutateState(env.DB, (state) => {
            const bill = findBill(state, id);
            assertPayable(bill, x.amount_cents);
            assertOriginal(state, bill);

            cap(state.payments, 300);
            cap(state.receipts, 100);
            assertPaymentOperation(state, x.operation);
            if (funded)
              spendCash(
                state,
                bill,
                state.next.payments,
                x.amount_cents,
                user,
                x.cash_holder_id,
                x.payment_date,
                x.method,
              );
            const receipt_id = state.next.receipts++;
            state.receipts.push({
              id: receipt_id,
              key,
              name: x.receipt.name,
              mime: x.receipt.mime,
            });
            state.payments.push({
              id: state.next.payments++,
              bill_id: id,
              amount_cents: x.amount_cents,
              method: x.method,
              funding_source: funded ? "manager_funds" : x.funding_source,
              kind: "recorded",
              payment_date: x.payment_date,
              operation: x.operation,
              cash_holder_id: funded
                ? user.role === "assistant"
                  ? user.id
                  : x.cash_holder_id || null
                : null,
              receipt_id,
              receipt_name: x.receipt.name,
              actor,
              actor_id: user.id,
              destination: (() => {
                const supplier = state.suppliers.find(
                  (s) => s.id === bill.supplier_id,
                );
                return {
                  supplier: supplier.name,

                  reference: bill.service_reference || supplier.reference,
                };
              })(),
              review_status: "pending",
              review_revision: 0,
              review_events: [],
              created_at: new Date().toISOString(),
            });
            bill.paid_cents += x.amount_cents;
            addAudit(
              state,
              actor,
              "Abono externo registrado",
              `${bill.title} · S/ ${(x.amount_cents / 100).toFixed(2)} · ${x.operation}`,
            );
            return { ok: true };
          }),
          201,
        );
      } catch (error) {
        await env.BUCKET.delete(key);
        throw error;
      }
    }
    fail("Ruta no encontrada.", 404);
  } catch (error) {
    if (error instanceof ZodError)
      return json(
        {
          error: error.issues
            .map((x) => `${x.path.join(".")}: ${x.message}`)
            .join(" · "),
        },
        400,
      );
    if (!error.status)
      console.error("Clara Gestión de Pagos API:", error.message);
    return json(
      {
        error: error.status
          ? error.message
          : "No se pudo completar la operación. Inténtalo nuevamente.",
      },
      error.status || 500,
    );
  }
}
