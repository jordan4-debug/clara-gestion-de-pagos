import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { handleRequest } from "../../server/api.mjs";
import { fileStore } from "../../server/storage.mjs";
export function memory() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  for (const f of readdirSync("migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sqlite.exec(readFileSync("migrations/" + f, "utf8"));
  let batches = Promise.resolve();
  const db = {
    prepare(sql) {
      let values = [];
      return {
        bind(...args) {
          values = args;
          return this;
        },
        async first() {
          return sqlite.prepare(sql).get(...values);
        },
        async all() {
          return { results: sqlite.prepare(sql).all(...values) };
        },
        async run() {
          return {
            meta: { changes: sqlite.prepare(sql).run(...values).changes },
          };
        },
      };
    },
    batch(statements) {
      const transaction = batches.then(async () => {
        sqlite.exec("BEGIN");
        try {
          const result = [];
          for (const statement of statements)
            result.push(await statement.run());
          sqlite.exec("COMMIT");
          return result;
        } catch (error) {
          sqlite.exec("ROLLBACK");
          throw error;
        }
      });
      batches = transaction.catch(() => {});
      return transaction;
    },
  };
  const env = { DB: db, BUCKET: fileStore(db), DEMO_MODE: "true" };
  function client() {
    let cookie = "",
      csrf = "";
    return async (path, method = "GET", body) => {
      const res = await handleRequest(
        new Request("https://clara.example/api" + path, {
          method,
          headers: {
            Origin: "https://clara.example",
            Cookie: cookie,
            "X-CSRF-Token": csrf,
            "Content-Type": "application/json",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
        env,
      );
      if (res.headers.get("set-cookie"))
        cookie = res.headers.get("set-cookie").split(";")[0];
      const data = res.headers.get("content-type")?.includes("json")
        ? await res.json()
        : await res.text();
      if (data.csrf) csrf = data.csrf;
      return { status: res.status, data };
    };
  }
  return { sqlite, db, env, client };
}
