// A stand-in for Cloudflare D1 on Node's built-in SQLite, so the worker's real SQL runs in
// tests. Covers the parts of the D1 API the worker uses: prepare().bind().first/all/run and batch.
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export function fakeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const statement = (sql, args = []) => ({
    bind: (...values) => statement(sql, values),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
    runSync: () => db.prepare(sql).run(...args),
  });
  return {
    prepare: (sql) => statement(sql),
    batch: async (stmts) => {
      db.exec('BEGIN');
      try {
        for (const s of stmts) s.runSync();
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
    raw: db,
  };
}
