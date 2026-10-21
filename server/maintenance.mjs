import { createHash } from "node:crypto";
import { z } from "zod";
import { mutateState, addAudit } from "./cloud-state.mjs";
import { verifyPassword } from "./passwords.mjs";

export const snapshotDigest = (state) =>
  createHash("sha256").update(JSON.stringify(state)).digest("hex");

const resetInput = z
  .object({
    confirmation: z.literal("VACIAR REGISTROS PARA PRESENTACION"),
    snapshot_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    password: z.string().min(1).max(128),
  })
  .strict();

export async function resetPresentation(env, user, input) {
  const fail = (message, status) => {
    throw Object.assign(new Error(message), { status });
  };
  if (user.role !== "owner" || user.demo)
    fail(
      "Solo un gerente privado puede preparar el espacio de presentación.",
      403,
    );
  const data = resetInput.parse(input);
  const account = await env.DB.prepare("SELECT * FROM accounts WHERE id=?")
    .bind(user.id)
    .first();
  if (!account || !(await verifyPassword(data.password, account.password_hash)))
    fail("La contraseña de confirmación es incorrecta.", 403);

  const result = await mutateState(env.DB, (state) => {
    if (snapshotDigest(state) !== data.snapshot_sha256)
      fail(
        "Los registros cambiaron después del respaldo. Descarga un respaldo nuevo antes de vaciar.",
        409,
      );
    const fields = [
      "bills",
      "loans",
      "payments",
      "receipts",
      "cash_movements",
      "templates",
      "activity",
    ];
    const deleted = Object.fromEntries(
      fields.map((field) => [field, (state[field] || []).length]),
    );
    const keys = [...new Set(state.receipts.map((r) => r.key))];
    // Keep identifiers increasing so an old tab or document URL cannot target a new record.
    for (const [field, counter] of [
      ["bills", "bills"],
      ["loans", "loans"],
      ["payments", "payments"],
      ["receipts", "receipts"],
      ["cash_movements", "cash"],
      ["templates", "templates"],
      ["activity", "activity"],
    ]) {
      state.next[counter] = Math.max(
        state.next[counter] || 1,
        ...(state[field] || []).map((r) => r.id + 1),
      );
    }
    for (const field of fields) state[field] = [];
    state.finance_periods = {};
    state.settings = {};
    addAudit(
      state,
      user.name,
      "Espacio preparado para presentación",
      "Recibos, préstamos, pagos y fondo vaciados con respaldo previo. Cuentas y entidades conservadas.",
    );
    return { deleted, keys };
  });
  const failed = [];
  for (const key of result.keys) {
    try {
      await env.BUCKET.delete(key);
    } catch {
      failed.push(key);
    }
  }
  return {
    ok: failed.length === 0,
    deleted: result.deleted,
    files_deleted: result.keys.length - failed.length,
    failed_file_keys: failed,
  };
}
