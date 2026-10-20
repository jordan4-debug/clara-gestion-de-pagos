// Bounded demonstration uploads in D1, avoiding a separate R2 billing setup.
// Each chunk is 64 KB before base64, below D1 row and statement limits.
export function fileStore(db) {
  return {
    async put(key, content, options) {
      const buffer = Buffer.from(content),
        parts = Math.ceil(buffer.length / 65536);
      if (buffer.length > 5 * 1024 * 1024)
        throw new Error("Archivo demasiado grande.");
      const statements = [
        db
          .prepare(
            "INSERT INTO receipt_files(key,content_type,parts,size) VALUES(?,?,?,?)",
          )
          .bind(key, options.httpMetadata.contentType, parts, buffer.length),
      ];
      for (let part = 0; part < parts; part++)
        statements.push(
          db
            .prepare(
              "INSERT INTO receipt_chunks(file_key,part,content) VALUES(?,?,?)",
            )
            .bind(
              key,
              part,
              buffer
                .subarray(part * 65536, (part + 1) * 65536)
                .toString("base64"),
            ),
        );
      await db.batch(statements);
    },
    async get(key) {
      const file = await db
        .prepare("SELECT * FROM receipt_files WHERE key=?")
        .bind(key)
        .first();
      if (!file) return null;
      const rows = await db
        .prepare(
          "SELECT part,content FROM receipt_chunks WHERE file_key=? ORDER BY part",
        )
        .bind(key)
        .all();
      if (rows.results.length !== file.parts)
        throw new Error("El archivo está incompleto.");
      const body = Buffer.concat(
        rows.results.map((r) => Buffer.from(r.content, "base64")),
      );
      if (body.length !== file.size)
        throw new Error("El tamaño del archivo no coincide.");
      return { body, httpMetadata: { contentType: file.content_type } };
    },
    async delete(key) {
      await db.prepare("DELETE FROM receipt_files WHERE key=?").bind(key).run();
    },
  };
}
