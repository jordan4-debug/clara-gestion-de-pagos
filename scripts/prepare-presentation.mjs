import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

const base = (
  process.env.CLARA_BASE_URL || "https://clara-gestion-de-pagos.pages.dev"
).replace(/\/$/, "");
const email = process.env.CLARA_MANAGER_EMAIL;
const password = process.env.CLARA_MANAGER_PASSWORD;
if (!email || !password)
  throw new Error(
    "Configura las credenciales del gerente en el entorno local.",
  );
const reset = process.argv.includes("--reset");
const destination = resolve(
  ".local",
  "respaldo-presentacion-" + new Date().toISOString().replace(/[:.]/g, "-"),
);
const sha = (body) => createHash("sha256").update(body).digest("hex");
const login = await fetch(base + "/api/auth/login", {
  method: "POST",
  headers: { Origin: base, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
assert.equal(login.status, 200, "No se pudo iniciar sesión.");
const session = await login.json();
assert.equal(session.user.role, "owner");
assert.equal(session.user.demo, false);
const headers = {
  Origin: base,
  Cookie: login.headers.get("set-cookie").split(";")[0],
  "X-CSRF-Token": session.csrf,
  "Content-Type": "application/json",
};
async function call(path, method = "GET", body) {
  const r = await fetch(base + "/api" + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r;
}
try {
  await mkdir(destination + "/archivos", { recursive: true });
  const backup = await (await call("/export")).json();
  const team = await (await call("/team")).json();
  await writeFile(
    destination + "/estado.json",
    JSON.stringify(backup, null, 2),
  );
  await writeFile(destination + "/equipo.json", JSON.stringify(team, null, 2));
  const files = [];
  for (const receipt of backup.state.receipts) {
    const body = Buffer.from(
      await (await call("/receipts/" + receipt.id)).arrayBuffer(),
    );
    const path = "archivos/" + receipt.id + ".bin";
    await writeFile(destination + "/" + path, body);
    assert.equal(sha(await readFile(destination + "/" + path)), sha(body));
    files.push({
      id: receipt.id,
      key: receipt.key,
      name: receipt.name,
      mime: receipt.mime,
      path,
      size: body.length,
      sha256: sha(body),
    });
  }
  const fresh = await (await call("/export")).json();
  assert.deepEqual(
    fresh.state,
    backup.state,
    "Los registros cambiaron durante el respaldo. Repite la operación.",
  );
  const manifest = {
    source: base,
    created_at: new Date().toISOString(),
    snapshot_sha256: sha(JSON.stringify(backup.state)),
    files,
    counts: Object.fromEntries(
      [
        "bills",
        "loans",
        "payments",
        "receipts",
        "cash_movements",
        "suppliers",
        "templates",
        "activity",
      ].map((k) => [k, (backup.state[k] || []).length]),
    ),
  };
  await writeFile(
    destination + "/manifiesto.json",
    JSON.stringify(manifest, null, 2),
  );
  console.log(
    JSON.stringify({
      backup: destination,
      verified_files: files.length,
      counts: manifest.counts,
    }),
  );
  if (reset) {
    const result = await (
      await call("/maintenance/reset-records", "POST", {
        confirmation: "VACIAR REGISTROS PARA PRESENTACION",
        snapshot_sha256: manifest.snapshot_sha256,
        password,
      })
    ).json();
    await writeFile(
      destination + "/resultado-limpieza.json",
      JSON.stringify(result, null, 2),
    );
    assert.equal(
      result.ok,
      true,
      "Hay archivos pendientes de retirar; consulta resultado-limpieza.json.",
    );
    const after = (await (await call("/export")).json()).state;
    for (const key of [
      "bills",
      "loans",
      "payments",
      "receipts",
      "cash_movements",
      "templates",
    ])
      assert.deepEqual(after[key], [], key);
    assert.deepEqual(
      after.suppliers,
      backup.state.suppliers,
      "El catálogo debe conservarse.",
    );
    assert.deepEqual(
      (await (await call("/team")).json()).members,
      team.members,
      "Las cuentas deben conservarse.",
    );
    console.log(
      JSON.stringify({
        reset: "verified",
        deleted: result.deleted,
        files_deleted: result.files_deleted,
        backup: destination,
      }),
    );
  }
} finally {
  await call("/auth/logout", "POST", {});
}
