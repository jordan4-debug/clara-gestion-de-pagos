import { randomUUID } from "node:crypto";
import { authenticate } from "./auth.mjs";
import { z, ZodError } from "zod";
import { today, monthDate, assertPayable } from "./domain.mjs";
import {
  billInput,
  supplierInput,
  templateInput,
  paymentInput,
  decodeReceipt,
  cents,
  month,
  receiptInput,
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
const settingsSchema = z.object({
  threshold_cents: cents,
  reminder_days: z.number().int().min(0).max(30),
  recipient: z.enum(["owner", "assistant", "both"]),
});
const paymentConfig = {
  mode: "disabled",
  configured: false,
  enabled: false,
  publicKey: "",
  merchant: "Demostración compartida · sin cobros",
};
const owner = (session) => {
  if (session.role !== "owner")
    fail("Solo el propietario puede hacer esto.", 403);
};
const cap = (items, max) => {
  if (items.length >= max)
    fail("Se alcanzó el límite de registros de esta demostración.", 409);
};
const supplierExists = (state, id) => {
  if (!state.suppliers.some((s) => s.id === id))
    fail("El proveedor no existe.", 400);
};
const findBill = (state, id) => {
  const bill = state.bills.find((b) => b.id === id);
  if (!bill) fail("Pago no encontrado.", 404);
  return bill;
};

async function body(request) {
  if (Number(request.headers.get("Content-Length") || 0) > 4500000)
    fail("El archivo es demasiado grande.", 413);
  const content = await request.text();
  if (content.length > 4500000) fail("El archivo es demasiado grande.", 413);
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
      if (path === "/dashboard")
        return json(
          dashboard(
            state,
            month.parse(url.searchParams.get("month") || today().slice(0, 7)),
            session.role,
          ),
        );
      if (path === "/suppliers")
        return json(
          [...state.suppliers].sort((a, b) => a.name.localeCompare(b.name)),
        );
      if (path === "/templates")
        return json(
          state.templates.map((t) => ({
            ...t,
            supplier: state.suppliers.find((s) => s.id === t.supplier_id).name,
          })),
        );
      if (path === "/activity") return json(state.activity.slice(0, 300));
      if (path === "/settings")
        return json({ ...state.settings, payment: paymentConfig });
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
    if (/\/checkout$|^\/attempts\//.test(path))
      fail("Los pagos reales están desactivados en esta demostración.", 503);
    const input = await body(request);
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
      owner(session);
      const x = supplierInput.parse(input);
      if (x.channel !== "external")
        fail("En esta etapa solo se registran pagos externos.", 409);
      if (!["POST", "PUT"].includes(method)) fail("Método no permitido.", 405);
      const id = Number(path.split("/")[2]);
      return json(
        await mutateState(env.DB, (state) => {
          if (method === "POST" && path === "/suppliers") {
            cap(state.suppliers, 100);
            state.suppliers.push({ id: state.next.suppliers++, ...x });
          } else if (method === "PUT" && id) {
            const previous = state.suppliers.find((s) => s.id === id);
            if (!previous) fail("Proveedor no encontrado.", 404);
            const sensitive =
              previous.bank !== x.bank || previous.account !== x.account;
            Object.assign(previous, x);
            if (sensitive)
              for (const bill of state.bills.filter(
                (b) =>
                  b.supplier_id === id &&
                  (b.amount_cents === null || b.paid_cents < b.amount_cents),
              )) {
                if (bill.approval !== "blocked") bill.approval = "required";
                bill.approved_by = null;
                bill.approved_at = null;
              }
          } else fail("Ruta no encontrada.", 404);
          addAudit(state, actor, "Proveedor guardado", x.name);
          return { ok: true };
        }),
      );
    }
    if (method === "POST" && path === "/templates") {
      owner(session);
      const x = templateInput.parse(input);
      return json(
        await mutateState(env.DB, (state) => {
          supplierExists(state, x.supplier_id);
          cap(state.templates, 100);
          state.templates.push({ id: state.next.templates++, active: 1, ...x });
          addAudit(state, actor, "Recurrente creado", x.title);
          return { ok: true };
        }),
        201,
      );
    }
    let match = path.match(/^\/templates\/(\d+)$/);
    if (method === "PATCH" && match) {
      owner(session);
      const x = z.object({ active: z.boolean() }).parse(input),
        id = Number(match[1]);
      return json(
        await mutateState(env.DB, (state) => {
          const t = state.templates.find((t) => t.id === id);
          if (!t) fail("Recurrente no encontrado.", 404);
          t.active = Number(x.active);
          addAudit(
            state,
            actor,
            "Recurrente actualizado",
            `${t.title}: ${x.active ? "activo" : "pausado"}`,
          );
          return { ok: true };
        }),
      );
    }
    if (method === "POST" && path === "/months/generate") {
      const selected = month.parse(input.month);
      return json(
        await mutateState(env.DB, (state) => {
          let created = 0;
          for (const t of state.templates.filter((t) => t.active)) {
            if (
              state.bills.some(
                (b) => b.month === selected && b.template_id === t.id,
              )
            )
              continue;
            cap(state.bills, 300);
            state.bills.push({
              id: state.next.bills++,
              title: t.title,
              supplier_id: t.supplier_id,
              amount_cents: t.amount_cents,
              paid_cents: 0,
              due_date: monthDate(selected, t.day),
              month: selected,
              template_id: t.id,
              notes: "",
              approval:
                t.amount_cents !== null &&
                t.amount_cents >= state.settings.threshold_cents
                  ? "required"
                  : "approved",
            });
            created++;
          }
          if (created)
            addAudit(
              state,
              actor,
              "Mes preparado",
              `${selected}: ${created} pagos creados sin duplicar.`,
            );
          return { created };
        }),
      );
    }
    match = path.match(/^\/bills\/(\d+)$/);
    if (
      (method === "POST" && path === "/bills") ||
      (method === "PATCH" && match)
    ) {
      const x = billInput.parse(input),
        id = match ? Number(match[1]) : null;
      return json(
        await mutateState(env.DB, (state) => {
          supplierExists(state, x.supplier_id);
          if (id) {
            const bill = findBill(state, id);
            if (bill.paid_cents > 0)
              fail("No se modifica un pago con abonos.", 409);
            const changed =
              x.amount_cents !== bill.amount_cents ||
              x.supplier_id !== bill.supplier_id;
            const approval =
              bill.approval === "blocked"
                ? "blocked"
                : changed &&
                    (bill.approved_by ||
                      x.supplier_id !== bill.supplier_id ||
                      (x.amount_cents !== null &&
                        x.amount_cents >= state.settings.threshold_cents))
                  ? "required"
                  : bill.approval;
            Object.assign(bill, x, { month: x.due_date.slice(0, 7), approval });
            if (changed) {
              bill.approved_by = null;
              bill.approved_at = null;
            }
          } else {
            cap(state.bills, 300);
            state.bills.push({
              id: state.next.bills++,
              ...x,
              paid_cents: 0,
              month: x.due_date.slice(0, 7),
              template_id: null,
              approval:
                x.amount_cents !== null &&
                x.amount_cents >= state.settings.threshold_cents
                  ? "required"
                  : "approved",
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
    }
    match = path.match(/^\/bills\/(\d+)\/approval$/);
    if (method === "POST" && match) {
      owner(session);
      const x = z
          .object({ approval: z.enum(["approved", "blocked"]) })
          .parse(input),
        id = Number(match[1]);
      return json(
        await mutateState(env.DB, (state) => {
          const bill = findBill(state, id);
          if (
            bill.amount_cents !== null &&
            bill.paid_cents === bill.amount_cents
          )
            fail("Este pago ya está completo.", 409);
          bill.approval = x.approval;
          bill.approved_by = user.id;
          bill.approved_at = new Date().toISOString();
          addAudit(
            state,
            actor,
            x.approval === "approved" ? "Pago autorizado" : "Pago bloqueado",
            bill.title,
          );
          return { ok: true };
        }),
      );
    }
    match = path.match(/^\/bills\/(\d+)\/payments$/);
    if (method === "POST" && match) {
      const x = paymentInput.parse(input),
        content = decodeReceipt(x.receipt),
        id = Number(match[1]);
      // Validate before uploading; validate again inside the optimistic transaction.
      const { state } = await readState(env.DB);
      assertPayable(findBill(state, id), x.amount_cents);
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
            cap(state.payments, 300);
            cap(state.receipts, 100);
            if (
              state.payments.some(
                (p) => p.method === x.method && p.operation === x.operation,
              )
            )
              fail(
                "Esta operación ya está registrada. No vuelvas a ingresarla.",
                409,
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
              operation: x.operation,
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
                  bank: supplier.bank,
                  account: supplier.account,
                  reference: supplier.reference,
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
    if (method === "PUT" && path === "/settings") {
      owner(session);
      const x = settingsSchema.parse(input);
      return json(
        await mutateState(env.DB, (state) => {
          const thresholdChanged =
            state.settings.threshold_cents !== x.threshold_cents;
          state.settings = x;
          for (const b of state.bills)
            if (
              thresholdChanged &&
              b.approval === "approved" &&
              b.amount_cents !== null &&
              b.paid_cents < b.amount_cents &&
              b.amount_cents >= x.threshold_cents
            )
              b.approval = "required";
          addAudit(
            state,
            actor,
            "Configuración actualizada",
            "Reglas de autorización y avisos guardadas.",
          );
          return { ok: true };
        }),
      );
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
