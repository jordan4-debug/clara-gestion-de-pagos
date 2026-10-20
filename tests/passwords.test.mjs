import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../server/passwords.mjs";
test("Passwords use independent salts and reject wrong input", async () => {
  const password = "Clave de prueba sin valor real 2026";
  const first = await hashPassword(password),
    second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.ok(!first.includes(password));
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword(password + "x", first), false);
  assert.equal(await verifyPassword(password, "invalid"), false);
});
