import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readState, mutateState, addAudit } from './cloud-state.mjs';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(
    'CREATE TABLE shared_state(id INTEGER PRIMARY KEY, revision INTEGER NOT NULL, payload TEXT NOT NULL)',
  );
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
        async run() {
          return { meta: { changes: sqlite.prepare(sql).run(...values).changes } };
        },
      };
    },
  };
  return { db, sqlite };
}
test('Concurrent visitors preserve both changes with revision checks', async () => {
  const { db, sqlite } = database();
  await readState(db);
  await Promise.all(
    ['Uno', 'Dos', 'Tres', 'Cuatro'].map((actor) =>
      mutateState(db, (s) => addAudit(s, actor, 'Prueba', 'Cambio concurrente')),
    ),
  );
  const { state, revision } = await readState(db);
  assert.equal(revision, 4);
  for (const actor of ['Uno', 'Dos', 'Tres', 'Cuatro'])
    assert.equal(state.activity.filter((a) => a.actor === actor).length, 1);
  assert.equal(new Set(state.activity.map((a) => a.id)).size, state.activity.length);
  sqlite.close();
});
test('Rejected mutations do not partially save workspace data', async () => {
  const { db, sqlite } = database();
  const initial = await readState(db);
  await assert.rejects(
    mutateState(db, (s) => {
      s.bills = [];
      throw new Error('invalid payment');
    }),
  );
  const saved = await readState(db);
  assert.deepEqual(saved, initial);
  sqlite.close();
});
