import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileStore } from "../server/storage.mjs";
function memory() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  sqlite.exec(readFileSync("migrations/0001_schema.sql", "utf8"));
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
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { sqlite, db };
}
test("A large attachment survives D1 chunk roundtrip and cascade deletion", async () => {
  const { sqlite, db } = memory(),
    store = fileStore(db),
    content = Buffer.alloc(5 * 1024 * 1024, 91);
  await store.put("receipt", content, {
    httpMetadata: { contentType: "application/pdf" },
  });
  const saved = await store.get("receipt");
  assert.deepEqual(saved.body, content);
  assert.equal(saved.httpMetadata.contentType, "application/pdf");
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM receipt_chunks").get().n,
    80,
  );
  await store.delete("receipt");
  assert.equal(await store.get("receipt"), null);
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM receipt_chunks").get().n,
    0,
  );
  sqlite.close();
});
test("Oversized files are rejected without writing rows", async () => {
  const { sqlite, db } = memory();
  await assert.rejects(
    fileStore(db).put("too-large", Buffer.alloc(5 * 1024 * 1024 + 1), {
      httpMetadata: { contentType: "image/png" },
    }),
  );
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM receipt_files").get().n,
    0,
  );
  sqlite.close();
});
