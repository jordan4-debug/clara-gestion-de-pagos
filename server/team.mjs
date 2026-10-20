import { z } from "zod";
import { hashPassword } from "./passwords.mjs";
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const json = (value) =>
  Response.json(value, { headers: { "Cache-Control": "no-store" } });
const columns = "id,name,email,role,demo,active,created_at";
export async function handleTeam(request, env, user, path, input) {
  if (user.role !== "owner") fail("Solo el gerente administra el equipo.", 403);
  if (request.method === "GET" && path === "/team") {
    const rows = await env.DB.prepare(
      `SELECT ${columns} FROM accounts WHERE demo=? ORDER BY id`,
    )
      .bind(user.demo ? 1 : 0)
      .all();
    const events = user.demo
      ? []
      : (
          await env.DB.prepare(
            `SELECT e.id,e.action,e.created_at,a.name AS actor,t.name AS target
      FROM account_events e JOIN accounts a ON a.id=e.actor_id JOIN accounts t ON t.id=e.target_id ORDER BY e.id DESC LIMIT 50`,
          ).all()
        ).results;
    return json({ members: rows.results, canManage: !user.demo, events });
  }
  if (user.demo)
    fail(
      "Ingresa con una cuenta privada de gerente para administrar integrantes.",
      403,
    );
  if (request.method === "POST" && path === "/team") {
    const data = z
      .object({
        name: z.string().trim().min(2).max(100),
        email: z
          .string()
          .trim()
          .email()
          .max(150)
          .transform((s) => s.toLowerCase()),
        role: z.enum(["owner", "assistant"]),
        password: z.string().min(12).max(128),
      })
      .parse(input);
    const hash = await hashPassword(data.password);
    try {
      const [result] = await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO accounts(name,email,role,password_hash,demo) SELECT ?,?,?,?,0 WHERE (SELECT COUNT(*) FROM accounts WHERE demo=0)<20",
        ).bind(data.name, data.email, data.role, hash),
        env.DB.prepare(
          "INSERT INTO account_events(actor_id,target_id,action) SELECT ?,id,'Integrante creado' FROM accounts WHERE email=? AND changes()>0",
        ).bind(user.id, data.email),
      ]);
      if (!result.meta.changes)
        fail("Se alcanzó el límite de 20 integrantes.", 409);
    } catch (e) {
      if (/UNIQUE constraint failed/i.test(e.message))
        fail("Ya existe una cuenta con ese correo.", 409);
      throw e;
    }
    return json({ ok: true });
  }
  const match = path.match(/^\/team\/(\d+)$/);
  if (request.method === "PATCH" && match) {
    const id = Number(match[1]),
      { active } = z.object({ active: z.boolean() }).parse(input);
    if (id === user.id) fail("No puedes desactivar tu propia cuenta.", 409);
    const [result] = await env.DB.batch([
      env.DB.prepare(
        `UPDATE accounts SET active=? WHERE id=? AND demo=0 AND
      (role<>'owner' OR ?=1 OR (SELECT COUNT(*) FROM accounts WHERE role='owner' AND demo=0 AND active=1)>1)`,
      ).bind(Number(active), id, Number(active)),
      env.DB.prepare(
        "INSERT INTO account_events(actor_id,target_id,action) SELECT ?,?,? WHERE changes()>0",
      ).bind(
        user.id,
        id,
        active ? "Integrante activado" : "Integrante desactivado",
      ),
    ]);
    if (!result.meta.changes)
      fail("No se pudo cambiar la cuenta. Debe quedar un gerente activo.", 409);
    if (!active)
      await env.DB.prepare("DELETE FROM demo_sessions WHERE user_id=?")
        .bind(id)
        .run();
    return json({ ok: true });
  }
  fail("Método o ruta no permitidos.", 405);
}
