import { describe, expect, test } from 'bun:test';
import {
  deriveAssertions,
  filterToNetEffect,
  normalizeDatabaseUrl,
  reconcile,
  splitStatements,
  verdictFor,
} from './auto-resolve-migrations.ts';

type Cat = Parameters<typeof verdictFor>[1];

function catalog(parts: Partial<Record<keyof Cat, string[]>> = {}): Cat {
  return {
    tables: new Set(parts.tables ?? []),
    columns: new Set(parts.columns ?? []),
    indexes: new Set(parts.indexes ?? []),
    constraints: new Set(parts.constraints ?? []),
    enums: new Set(parts.enums ?? []),
    enumValues: new Set(parts.enumValues ?? []),
  };
}

const mig = (name: string, sql: string, checksum = name) => ({ name, sql, checksum });
const row = (
  migration_name: string,
  o: { checksum?: string; finished?: boolean; rolledBack?: boolean } = {}
) => ({
  migration_name,
  checksum: o.checksum ?? migration_name,
  finished_at: o.finished === false ? null : new Date(),
  rolled_back_at: o.rolledBack ? new Date() : null,
});

describe('normalizeDatabaseUrl', () => {
  test('strips Prisma-only parameters that libpq and Bun both reject', () => {
    // config\.env.example ships exactly this shape; ?schema=public made both
    // Bun's client and pg_dump fail outright.
    const { url, schema } = normalizeDatabaseUrl(
      'postgresql://u:p@127.0.0.1:5432/car_stock?schema=public&connection_limit=5&pgbouncer=true'
    );
    expect(url).toBe('postgresql://u:p@127.0.0.1:5432/car_stock');
    expect(schema).toBe('public');
  });

  test('keeps genuine libpq parameters and a non-default schema', () => {
    const { url, schema } = normalizeDatabaseUrl(
      'postgresql://u:p@h:5432/db?sslmode=require&schema=vbeyond&connection_limit=1'
    );
    expect(url).toContain('sslmode=require');
    expect(url).not.toContain('connection_limit');
    expect(schema).toBe('vbeyond');
  });

  test('a plain URL and an unparseable string are passed through', () => {
    expect(normalizeDatabaseUrl('postgresql://u:p@h:5432/db').url).toBe(
      'postgresql://u:p@h:5432/db'
    );
    expect(normalizeDatabaseUrl('not a url').schema).toBe('public');
  });
});

describe('splitStatements', () => {
  test('drops -- and /* */ comments and splits on top-level semicolons', () => {
    const out = splitStatements(`
      -- a comment with a ; semicolon
      /* block ; comment */
      CREATE TABLE "a" ("id" TEXT);
      ALTER TABLE "b"
        ADD COLUMN "x" TEXT,
        ADD COLUMN "y" TEXT;
    `);
    expect(out).toHaveLength(2);
    expect(out[1]).toContain('ADD COLUMN "y"');
  });

  test('a semicolon inside a string literal does not split', () => {
    expect(splitStatements(`UPDATE t SET v = 'a;b';`)).toHaveLength(1);
  });
});

describe('deriveAssertions', () => {
  test('multi-column ALTER TABLE yields one assertion per column', () => {
    const { assertions, hasDdl } = deriveAssertions(
      `ALTER TABLE "sales" ADD COLUMN "a" TEXT, ADD COLUMN "b" TEXT;`
    );
    expect(hasDdl).toBe(true);
    expect(assertions.map((a) => a.key).sort()).toEqual(['sales.a', 'sales.b']);
    expect(assertions.every((a) => a.expect)).toBe(true);
  });

  test('DROP then re-ADD of the same constraint nets out to "must exist"', () => {
    const { assertions } = deriveAssertions(`
      ALTER TABLE "q" DROP CONSTRAINT "q_fk";
      ALTER TABLE "q" ADD CONSTRAINT "q_fk" FOREIGN KEY ("s") REFERENCES "s"("id");
    `);
    const fk = assertions.find((a) => a.key === 'q_fk');
    expect(fk?.expect).toBe(true);
  });

  test('enum rename carries assertions onto the new name', () => {
    const { assertions } = deriveAssertions(`
      CREATE TYPE "S_new" AS ENUM ('A');
      ALTER TYPE "S" RENAME TO "S_old";
      ALTER TYPE "S_new" RENAME TO "S";
      DROP TYPE "public"."S_old";
    `);
    const byKey = Object.fromEntries(assertions.map((a) => [`${a.kind}:${a.key}`, a.expect]));
    expect(byKey['enum:S']).toBe(true);
    expect(byKey['enum:S_new']).toBe(false);
    expect(byKey['enum:S_old']).toBe(false);
  });

  test('schema-qualified names are normalised', () => {
    const { assertions } = deriveAssertions(`ALTER TABLE "public"."sales" ADD COLUMN "z" TEXT;`);
    expect(assertions[0].key).toBe('sales.z');
  });

  test('a pure UPDATE is flagged as data-only', () => {
    const d = deriveAssertions(`UPDATE "payments" SET "issued_by" = 'x' WHERE 1=1;`);
    expect(d.hasDml).toBe(true);
    expect(d.hasDdl).toBe(false);
    expect(d.assertions).toHaveLength(0);
  });
});

describe('filterToNetEffect', () => {
  test('an object a later migration drops stops being asserted by its creator', () => {
    // Reproduces the bug that made `init` look PARTIAL: it creates
    // number_sequences_prefix_key, which 20251202050142 drops.
    const derived = [
      deriveAssertions(`CREATE UNIQUE INDEX "ns_prefix_key" ON "ns"("prefix");`),
      deriveAssertions(`DROP INDEX "ns_prefix_key";`),
    ];
    const [first] = filterToNetEffect(derived);
    expect(first.find((a) => a.key === 'ns_prefix_key')).toBeUndefined();
  });
});

describe('verdictFor', () => {
  const one = deriveAssertions(`ALTER TABLE "t" ADD COLUMN "a" TEXT, ADD COLUMN "b" TEXT;`);

  test('all objects present -> APPLIED', () => {
    const v = verdictFor(one.assertions, catalog({ columns: ['t.a', 't.b'] }), true, false);
    expect(v.verdict).toBe('APPLIED');
  });

  test('some present -> PARTIAL, and names what is missing', () => {
    const v = verdictFor(one.assertions, catalog({ columns: ['t.a'] }), true, false);
    expect(v.verdict).toBe('PARTIAL');
    expect(v.failures).toEqual(['missing column t.b']);
  });

  test('none present -> MISSING', () => {
    expect(verdictFor(one.assertions, catalog(), true, false).verdict).toBe('MISSING');
  });

  test('data-only and empty migrations are distinguished', () => {
    expect(verdictFor([], catalog(), false, true).verdict).toBe('DATA_ONLY');
    expect(verdictFor([], catalog(), false, false).verdict).toBe('NO_OP');
  });

  test('a negative-only migration is UNKNOWN, never "applied"', () => {
    // "SaleStatus_new does not exist" is equally true before and after the run,
    // so it must never be treated as proof on its own.
    const d = deriveAssertions(`DROP TYPE "S_old";`);
    expect(verdictFor(d.assertions, catalog(), true, false).verdict).toBe('UNKNOWN');
  });
});

describe('reconcile', () => {
  const migrations = [
    mig('001_init', `CREATE TABLE "t" ("id" TEXT);`),
    mig('002_col', `ALTER TABLE "t" ADD COLUMN "a" TEXT, ADD COLUMN "b" TEXT;`),
    mig('003_empty', '-- This is an empty migration.'),
    mig('004_data', `UPDATE "t" SET "a" = 'x';`),
    mig('005_late', `ALTER TABLE "t" ADD COLUMN "c" TEXT;`),
  ];
  const full = catalog({ tables: ['t'], columns: ['t.a', 't.b', 't.c'] });
  const byName = (r: ReturnType<typeof reconcile>) =>
    Object.fromEntries(r.plans.map((p) => [p.name, p.action]));

  test('empty database: nothing is written, everything is left to deploy', () => {
    const r = reconcile(migrations, [], catalog());
    expect(Object.values(byName(r)).every((a) => a === 'deploy')).toBe(true);
    expect(r.blocked).toHaveLength(0);
  });

  test('db push drift: every verifiable migration is resolved, data-only is not', () => {
    const r = reconcile(migrations, [], full);
    expect(byName(r)).toEqual({
      '001_init': 'resolve-applied',
      '002_col': 'resolve-applied',
      '003_empty': 'resolve-applied', // inferred: 005 is provably applied
      '004_data': 'deploy', // never assumed - deploy re-runs it
      '005_late': 'resolve-applied',
    });
  });

  test('partial application blocks instead of stranding the missing half', () => {
    const r = reconcile(migrations, [], catalog({ tables: ['t'], columns: ['t.a', 't.c'] }));
    expect(r.blocked.map((b) => b.name)).toEqual(['002_col']);
    expect(r.blocked[0].failures).toEqual(['missing column t.b']);
  });

  test('a renamed folder is matched by checksum and repaired by name', () => {
    const r = reconcile(
      [mig('002_renamed', `ALTER TABLE "t" ADD COLUMN "a" TEXT;`, 'sha-abc')],
      [row('002_old_name', { checksum: 'sha-abc' })],
      catalog({ columns: ['t.a'] })
    );
    expect(r.renames).toEqual([{ from: '002_old_name', to: '002_renamed' }]);
    expect(r.plans[0].action).toBe('rename-row');
    expect(r.orphans).toHaveLength(0);
  });

  test('an unmatched database row is reported but never deleted', () => {
    const r = reconcile(
      [mig('001_init', `CREATE TABLE "t" ("id" TEXT);`)],
      [row('001_init'), row('999_gone', { checksum: 'nothing-matches' })],
      catalog({ tables: ['t'] })
    );
    expect(r.orphans).toEqual(['999_gone']);
    expect(r.plans[0].action).toBe('none');
  });

  test('failed migration (P3009) whose objects exist is marked applied', () => {
    const r = reconcile(migrations, [row('002_col', { finished: false })], full);
    expect(byName(r)['002_col']).toBe('resolve-applied');
  });

  test('failed migration whose objects are absent is rolled back so deploy retries', () => {
    const r = reconcile(
      migrations,
      [row('005_late', { finished: false })],
      catalog({ tables: ['t'], columns: ['t.a', 't.b'] })
    );
    expect(byName(r)['005_late']).toBe('resolve-rolled-back');
  });

  test('an edited migration.sql realigns its checksum only when it is really applied', () => {
    const applied = reconcile(
      [mig('002_col', `ALTER TABLE "t" ADD COLUMN "a" TEXT;`, 'new-sha')],
      [row('002_col', { checksum: 'old-sha' })],
      catalog({ columns: ['t.a'] })
    );
    expect(applied.plans[0].action).toBe('fix-checksum');

    const notApplied = reconcile(
      [mig('002_col', `ALTER TABLE "t" ADD COLUMN "a" TEXT;`, 'new-sha')],
      [row('002_col', { checksum: 'old-sha' })],
      catalog()
    );
    expect(notApplied.plans[0].action).toBe('block');
  });

  test('a row marked rolled back but whose objects exist is re-marked applied', () => {
    const r = reconcile(migrations, [row('002_col', { rolledBack: true })], full);
    expect(byName(r)['002_col']).toBe('resolve-applied');
  });
});
