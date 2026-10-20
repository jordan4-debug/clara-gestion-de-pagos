import { mkdirSync, writeFileSync } from "node:fs";
import { run } from "./cloudflare.mjs";
const source = process.env.PREVIOUS_APP_URL;
if (!source)
  throw new Error(
    "Define PREVIOUS_APP_URL con la dirección del origen que deseas importar.",
  );
const previousUrl = new URL(source);
if (
  previousUrl.protocol !== "https:" ||
  previousUrl.username ||
  previousUrl.password ||
  previousUrl.search ||
  previousUrl.hash
)
  throw new Error(
    "El origen debe ser una dirección HTTPS sin credenciales ni parámetros.",
  );
const previous = previousUrl.origin;
const sql = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const existing = JSON.parse(
  run([
    "d1",
    "execute",
    "DB",
    "--remote",
    "--command",
    "SELECT COUNT(*) AS n FROM shared_state",
    "--json",
  ]),
);
if (existing[0]?.results[0]?.n !== 0)
  throw new Error("El destino ya contiene datos. No se sobrescribirá.");
const login = await fetch(previous + "/api/auth/login", {
  method: "POST",
  headers: { Origin: previous, "Content-Type": "application/json" },
  body: JSON.stringify({ role: "owner" }),
});
if (!login.ok)
  throw new Error(
    "No se pudo abrir la sesión de exportación del sitio anterior.",
  );
const cookie = login.headers.get("set-cookie")?.split(";")[0];
const response = await fetch(previous + "/api/export", {
  headers: { Cookie: cookie },
});
if (!response.ok) throw new Error("No se pudo exportar el espacio anterior.");
const backup = await response.json();
if (
  backup.schema_version !== 1 ||
  !Array.isArray(backup.state?.bills) ||
  !Array.isArray(backup.state?.receipts)
)
  throw new Error("Formato de respaldo no reconocido.");
const payload = JSON.stringify(backup.state);
if (Buffer.byteLength(payload) > 512000)
  throw new Error("El respaldo supera el límite del espacio de demostración.");
const statements = [
  `INSERT INTO shared_state(id,revision,payload) VALUES(1,0,${sql(payload)});`,
];
for (const receipt of backup.state.receipts) {
  const file = await fetch(previous + "/api/receipts/" + receipt.id, {
    headers: { Cookie: cookie },
  });
  if (!file.ok)
    throw new Error(
      `No se recuperó el comprobante #${receipt.id}; la importación se detuvo.`,
    );
  const bytes = Buffer.from(await file.arrayBuffer()),
    parts = Math.ceil(bytes.length / 65536);
  if (bytes.length > 5 * 1024 * 1024)
    throw new Error("Un archivo supera el límite de 5 MB.");
  statements.push(
    `INSERT INTO receipt_files(key,content_type,parts,size) VALUES(${sql(receipt.key)},${sql(receipt.mime)},${parts},${bytes.length});`,
  );
  for (let part = 0; part < parts; part++)
    statements.push(
      `INSERT INTO receipt_chunks(file_key,part,content) VALUES(${sql(receipt.key)},${part},${sql(bytes.subarray(part * 65536, (part + 1) * 65536).toString("base64"))});`,
    );
}
mkdirSync(".local", { recursive: true });
writeFileSync(
  ".local/previous-demo-backup.json",
  JSON.stringify(backup, null, 2),
  { mode: 0o600 },
);
writeFileSync(".local/import-demo.sql", statements.join("\n"), { mode: 0o600 });
run(["d1", "execute", "DB", "--remote", "--file", ".local/import-demo.sql"], {
  inherit: true,
});
console.log(
  `Traslado completado: ${backup.state.bills.length} obligaciones, ${backup.state.suppliers.length} proveedores, ${backup.state.templates.length} recurrentes y ${backup.state.receipts.length} comprobantes. No se copiaron sesiones ni contraseñas del alojamiento anterior.`,
);
