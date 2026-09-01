#!/usr/bin/env bun
/**
 * Reconcile _prisma_migrations with what is actually in the database, so that
 * `prisma migrate deploy` can run to completion on a drifted install.
 *
 * Why this exists
 *   Customer databases drift: someone ran `db push`, restored a dump taken before
 *   migrations existed, or a migration folder was renamed. `migrate deploy` then
 *   either refuses (P3005 / P3009) or tries to re-run DDL that is already there and
 *   records a failed migration. The documented fix is `migrate resolve --applied`
 *   per migration - which nobody on a dealership's server is going to work out.
 *
 * What it does
 *   For every migration folder it parses the SQL, derives the objects that must
 *   exist afterwards (tables, columns, indexes, constraints, enum types + values),
 *   and probes the catalog. Then it writes ONLY _prisma_migrations bookkeeping rows
 *   so the real work is left to `migrate deploy`, which runs right after.
 *
 * What it deliberately never does
 *   - No DDL. No DROP. No data change. No `migrate reset`.
 *   - Never marks a partially-applied migration as applied (that would strand the
 *     missing half forever) - it stops and reports instead.
 *   - Never marks a data-only migration as applied - unverifiable, and skipping a
 *     backfill is worse than re-running an idempotent one.
 *
 * Usage
 *   bun scripts/auto-resolve-migrations.ts                 # plan only (read-only)
 *   bun scripts/auto-resolve-migrations.ts --apply         # backup, then reconcile
 *   bun scripts/auto-resolve-migrations.ts --apply --no-backup
 *   ... --migrations <dir> --database-url <url> --backup-dir <dir> --json
 *
 * Exit codes
 *   0 nothing to do / reconciled     3 blocked, needs a human
 *   1 error                          4 backup failed
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SQL } from 'bun';

// ---------------------------------------------------------------- CLI + env

interface Options {
  apply: boolean;
  backup: boolean;
  backupDir: string | null;
  migrationsDir: string;
  databaseUrl: string;
  json: boolean;
}

function parseArgs(argv: string[]): Options {
  const get = (name: string): string | null => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
  };
  const migrationsDir = get('--migrations') ?? defaultMigrationsDir();
  const databaseUrl = get('--database-url') ?? resolveDatabaseUrl();
  return {
    apply: argv.includes('--apply'),
    backup: !argv.includes('--no-backup'),
    backupDir: get('--backup-dir'),
    migrationsDir,
    databaseUrl,
    json: argv.includes('--json'),
  };
}

/** Both layouts we ship: repo (apps/api/prisma) and portable (app\prisma). */
function defaultMigrationsDir(): string {
  // import.meta.dir, not new URL(import.meta.url).pathname - the latter yields
  // "/C:/VBeyond/app/scripts" on Windows and every join off it is wrong.
  const here = import.meta.dir;
  const candidates = [
    path.join(here, '..', 'prisma', 'migrations'),
    path.join(process.cwd(), 'prisma', 'migrations'),
    path.join(process.cwd(), 'apps', 'api', 'prisma', 'migrations'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return path.resolve(c);
  }
  return path.resolve(candidates[0]);
}

/** KEY=VALUE reader. Same tolerances as start.bat: BOM, quotes, blank lines, #. */
function readEnvFile(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(file)) return out;
  const text = fs.readFileSync(file, 'utf-8').replace(/^﻿/, '');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  // import.meta.dir, not new URL(import.meta.url).pathname - the latter yields
  // "/C:/VBeyond/app/scripts" on Windows and every join off it is wrong.
  const here = import.meta.dir;
  const files = [
    process.env.VB_HOME ? path.join(process.env.VB_HOME, 'config', '.env') : null,
    path.join(here, '..', '..', 'config', '.env'), // portable: app\scripts -> VB_HOME\config
    path.join(here, '..', '.env'), // repo: apps/api/.env
    path.join(process.cwd(), '.env'),
  ].filter(Boolean) as string[];
  for (const f of files) {
    const url = readEnvFile(f).DATABASE_URL;
    if (url) return url;
  }
  return '';
}

/**
 * Prisma connection strings carry driver-only query parameters - `?schema=public`
 * above all, which is what the installer writes into config\.env. Bun's SQL client
 * forwards unknown parameters to PostgreSQL as startup options, and the server
 * rejects them outright:
 *     ERROR: unrecognized configuration parameter "schema"
 * So strip everything PostgreSQL will not accept, and carry `schema` over as a
 * search_path instead - which is what Prisma does with it anyway.
 */
export function normalizeDatabaseUrl(raw: string): { url: string; schema: string } {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { url: raw, schema: 'public' }; // not a URL we can reason about - pass through
  }
  const PASS_THROUGH = new Set(['sslmode', 'application_name', 'options', 'connect_timeout']);
  let schema = 'public';
  for (const key of [...parsed.searchParams.keys()]) {
    if (key.toLowerCase() === 'schema') {
      schema = parsed.searchParams.get(key) || 'public';
      parsed.searchParams.delete(key);
    } else if (!PASS_THROUGH.has(key.toLowerCase())) {
      parsed.searchParams.delete(key);
    }
  }
  return { url: parsed.toString(), schema };
}

// ------------------------------------------------------- SQL -> assertions

type ObjKind = 'table' | 'column' | 'index' | 'constraint' | 'enum' | 'enumValue';

interface Assertion {
  kind: ObjKind;
  key: string; // normalised catalog key, e.g. "sales.insurance_fee"
  label: string; // human text for the report
  expect: boolean; // true = must exist, false = must be gone
}

/** Strip comments and split on top-level semicolons (quote-aware). */
export function splitStatements(sql: string): string[] {
  let s = sql.replace(/\/\*[\s\S]*?\*\//g, ' ');
  s = s
    .split(/\r?\n/)
    .map((line) => {
      // Remove -- comments, but not inside a string literal.
      let inStr = false;
      for (let i = 0; i < line.length; i++) {
        if (line[i] === "'") inStr = !inStr;
        else if (!inStr && line[i] === '-' && line[i + 1] === '-') return line.slice(0, i);
      }
      return line;
    })
    .join('\n');

  const out: string[] = [];
  let buf = '';
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "'") inStr = !inStr;
    if (ch === ';' && !inStr) {
      if (buf.trim()) out.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/** `"public"."sales"` / `"sales"` / `sales` -> `sales` */
function ident(raw: string): string {
  const parts = raw.trim().split('.');
  const last = parts[parts.length - 1];
  return last.replace(/"/g, '').trim();
}

const ID = '(?:"[^"]+"|[A-Za-z_][\\w$]*)';
const QUALIFIED = `(?:${ID}\\.)?${ID}`;

/**
 * Derive the net effect of a migration. Statements are processed in order and the
 * LAST one to touch an object wins - which is what makes
 * `DROP CONSTRAINT x` ... `ADD CONSTRAINT x` (a Prisma FK rewrite) resolve to
 * "x must exist" rather than "x must be gone".
 *
 * Anything not modelled (ALTER COLUMN TYPE, SET DEFAULT, data DML) is ignored on
 * purpose: an assertion we cannot evaluate is worse than no assertion, because it
 * would push a healthy migration into the "needs a human" bucket.
 */
export function deriveAssertions(sql: string): {
  assertions: Assertion[];
  hasDdl: boolean;
  hasDml: boolean;
} {
  const state = new Map<string, Assertion>();
  let hasDdl = false;
  let hasDml = false;

  const put = (a: Assertion) => state.set(`${a.kind}:${a.key}`, a);
  const forget = (kind: ObjKind, key: string) => state.delete(`${kind}:${key}`);

  for (const stmt of splitStatements(sql)) {
    const s = stmt.replace(/\s+/g, ' ').trim();
    const match = (pattern: string) => s.match(new RegExp(pattern, 'i'));

    // CREATE TABLE [IF NOT EXISTS] "t" (...)
    const createTable = match(`^CREATE TABLE (?:IF NOT EXISTS )?(${QUALIFIED})`);
    if (createTable) {
      hasDdl = true;
      const t = ident(createTable[1]);
      put({ kind: 'table', key: t, label: `table ${t}`, expect: true });
      continue;
    }

    // DROP TABLE [IF EXISTS] "t"
    const dropTable = match(`^DROP TABLE (?:IF EXISTS )?(${QUALIFIED})`);
    if (dropTable) {
      hasDdl = true;
      const t = ident(dropTable[1]);
      put({ kind: 'table', key: t, label: `table ${t}`, expect: false });
      continue;
    }

    // CREATE TYPE "T" AS ENUM (...)
    const createEnum = match(`^CREATE TYPE (${QUALIFIED}) AS ENUM`);
    if (createEnum) {
      hasDdl = true;
      const t = ident(createEnum[1]);
      put({ kind: 'enum', key: t, label: `enum type ${t}`, expect: true });
      continue;
    }

    // DROP TYPE [IF EXISTS] "T"
    const dropEnum = match(`^DROP TYPE (?:IF EXISTS )?(${QUALIFIED})`);
    if (dropEnum) {
      hasDdl = true;
      const t = ident(dropEnum[1]);
      put({ kind: 'enum', key: t, label: `enum type ${t}`, expect: false });
      continue;
    }

    // ALTER TYPE "T" RENAME TO "U"  -> T is gone, U carries T's assertions
    const renameEnum = match(`^ALTER TYPE (${QUALIFIED}) RENAME TO (${QUALIFIED})`);
    if (renameEnum) {
      hasDdl = true;
      const from = ident(renameEnum[1]);
      const to = ident(renameEnum[2]);
      forget('enum', from);
      for (const [k, a] of [...state]) {
        if (a.kind === 'enumValue' && a.key.startsWith(`${from}.`)) {
          state.delete(k);
          const label = a.key.slice(from.length + 1);
          put({
            kind: 'enumValue',
            key: `${to}.${label}`,
            label: `enum ${to} value '${label}'`,
            expect: a.expect,
          });
        }
      }
      put({ kind: 'enum', key: from, label: `enum type ${from}`, expect: false });
      put({ kind: 'enum', key: to, label: `enum type ${to}`, expect: true });
      continue;
    }

    // ALTER TYPE "T" ADD VALUE [IF NOT EXISTS] 'v'
    const addEnumValue = match(`^ALTER TYPE (${QUALIFIED}) ADD VALUE (?:IF NOT EXISTS )?'([^']+)'`);
    if (addEnumValue) {
      hasDdl = true;
      const t = ident(addEnumValue[1]);
      const value = addEnumValue[2];
      put({
        kind: 'enumValue',
        key: `${t}.${value}`,
        label: `enum ${t} value '${value}'`,
        expect: true,
      });
      continue;
    }

    // CREATE [UNIQUE] INDEX [IF NOT EXISTS] "n" ON ...
    const createIndex = match(`^CREATE (?:UNIQUE )?INDEX (?:IF NOT EXISTS )?(${ID}) ON`);
    if (createIndex) {
      hasDdl = true;
      const n = ident(createIndex[1]);
      put({ kind: 'index', key: n, label: `index ${n}`, expect: true });
      continue;
    }

    // DROP INDEX [IF EXISTS] "n"
    const dropIndex = match(`^DROP INDEX (?:IF EXISTS )?(${QUALIFIED})`);
    if (dropIndex) {
      hasDdl = true;
      const n = ident(dropIndex[1]);
      put({ kind: 'index', key: n, label: `index ${n}`, expect: false });
      continue;
    }

    // ALTER TABLE "t" <one or more comma-separated actions>
    const alterTable = match(`^ALTER TABLE (?:ONLY )?(${QUALIFIED}) (.+)$`);
    if (alterTable) {
      const table = ident(alterTable[1]);
      const body = alterTable[2];
      let touched = false;

      for (const cm of body.matchAll(new RegExp(`ADD COLUMN (?:IF NOT EXISTS )?(${ID})`, 'gi'))) {
        touched = true;
        const c = ident(cm[1]);
        put({
          kind: 'column',
          key: `${table}.${c}`,
          label: `column ${table}.${c}`,
          expect: true,
        });
      }
      for (const cm of body.matchAll(new RegExp(`DROP COLUMN (?:IF EXISTS )?(${ID})`, 'gi'))) {
        touched = true;
        const c = ident(cm[1]);
        put({
          kind: 'column',
          key: `${table}.${c}`,
          label: `column ${table}.${c}`,
          expect: false,
        });
      }
      for (const cm of body.matchAll(new RegExp(`ADD CONSTRAINT (${ID})`, 'gi'))) {
        touched = true;
        const n = ident(cm[1]);
        put({ kind: 'constraint', key: n, label: `constraint ${n}`, expect: true });
      }
      for (const cm of body.matchAll(new RegExp(`DROP CONSTRAINT (?:IF EXISTS )?(${ID})`, 'gi'))) {
        touched = true;
        const n = ident(cm[1]);
        put({ kind: 'constraint', key: n, label: `constraint ${n}`, expect: false });
      }
      // ALTER COLUMN / SET DEFAULT / RENAME are real DDL but not modelled.
      if (/^ALTER TABLE/i.test(s)) hasDdl = true;
      if (touched) continue;
      continue;
    }

    if (/^(INSERT|UPDATE|DELETE)\b/i.test(s)) {
      hasDml = true;
      continue;
    }
    if (/^(CREATE|ALTER|DROP|COMMENT)\b/i.test(s)) hasDdl = true;
  }

  return { assertions: [...state.values()], hasDdl, hasDml };
}

// --------------------------------------------------------------- catalogue

interface Catalog {
  tables: Set<string>;
  columns: Set<string>;
  indexes: Set<string>;
  constraints: Set<string>;
  enums: Set<string>;
  enumValues: Set<string>;
}

async function loadCatalog(sql: SQL): Promise<Catalog> {
  const rows = async <T>(q: string): Promise<T[]> => (await sql.unsafe(q)) as T[];

  const tables = await rows<{ table_name: string }>(
    'select table_name from information_schema.tables where table_schema = current_schema()'
  );
  const columns = await rows<{ table_name: string; column_name: string }>(
    'select table_name, column_name from information_schema.columns where table_schema = current_schema()'
  );
  const indexes = await rows<{ indexname: string }>(
    'select indexname from pg_indexes where schemaname = current_schema()'
  );
  const constraints = await rows<{ conname: string }>(
    `select c.conname from pg_constraint c
       join pg_namespace n on n.oid = c.connamespace
      where n.nspname = current_schema()`
  );
  const enums = await rows<{ typname: string; enumlabel: string | null }>(
    `select t.typname, e.enumlabel
       from pg_type t
       join pg_namespace n on n.oid = t.typnamespace
       left join pg_enum e on e.enumtypid = t.oid
      where n.nspname = current_schema() and t.typtype = 'e'`
  );

  return {
    tables: new Set(tables.map((r) => r.table_name)),
    columns: new Set(columns.map((r) => `${r.table_name}.${r.column_name}`)),
    indexes: new Set(indexes.map((r) => r.indexname)),
    constraints: new Set(constraints.map((r) => r.conname)),
    enums: new Set(enums.map((r) => r.typname)),
    enumValues: new Set(enums.filter((r) => r.enumlabel).map((r) => `${r.typname}.${r.enumlabel}`)),
  };
}

function holds(a: Assertion, cat: Catalog): boolean {
  const present =
    a.kind === 'table'
      ? cat.tables.has(a.key)
      : a.kind === 'column'
        ? cat.columns.has(a.key)
        : a.kind === 'index'
          ? cat.indexes.has(a.key)
          : a.kind === 'constraint'
            ? cat.constraints.has(a.key)
            : a.kind === 'enum'
              ? cat.enums.has(a.key)
              : cat.enumValues.has(a.key);
  return present === a.expect;
}

// ---------------------------------------------------------------- verdicts

type Verdict =
  | 'APPLIED' // every object it creates is there
  | 'APPLIED_INFERRED' // unverifiable, but a later migration is provably applied
  | 'MISSING' // none of its objects are there
  | 'PARTIAL' // some are, some are not - needs a human
  | 'DATA_ONLY' // pure DML; deploy re-runs it
  | 'NO_OP' // empty migration
  | 'UNKNOWN'; // no positive assertion could be derived

interface MigrationPlan {
  name: string;
  checksum: string;
  verdict: Verdict;
  satisfied: number;
  total: number;
  failures: string[];
  action: Action;
  detail: string;
}

type Action =
  | 'none'
  | 'resolve-applied'
  | 'resolve-rolled-back'
  | 'fix-checksum'
  | 'rename-row'
  | 'deploy'
  | 'block';

interface DbRow {
  migration_name: string;
  checksum: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
}

function sha256(file: string): string {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(fs.readFileSync(file));
  return hasher.digest('hex');
}

export function readMigrations(
  dir: string
): Array<{ name: string; sql: string; checksum: string }> {
  if (!fs.existsSync(dir)) throw new Error(`Migrations folder not found: ${dir}`);
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, 'migration.sql')))
    .map((d) => d.name)
    .sort()
    .map((name) => {
      const file = path.join(dir, name, 'migration.sql');
      return { name, sql: fs.readFileSync(file, 'utf-8'), checksum: sha256(file) };
    });
}

/**
 * Verdict for one migration, from its assertions alone.
 *
 * Only positive assertions ("this object must exist") count as evidence. A negative
 * one is checked, but is never proof on its own: "SaleStatus_new does not exist"
 * is equally true before the migration runs and after it finishes.
 */
export function verdictFor(
  assertions: Assertion[],
  cat: Catalog,
  hasDdl: boolean,
  hasDml: boolean
): { verdict: Verdict; satisfied: number; total: number; failures: string[] } {
  const positives = assertions.filter((a) => a.expect);
  const negatives = assertions.filter((a) => !a.expect);
  const failures: string[] = [];

  if (positives.length === 0) {
    const v: Verdict = hasDml && !hasDdl ? 'DATA_ONLY' : !hasDdl && !hasDml ? 'NO_OP' : 'UNKNOWN';
    return { verdict: v, satisfied: 0, total: 0, failures };
  }

  const ok = positives.filter((a) => holds(a, cat));
  for (const a of positives) if (!holds(a, cat)) failures.push(`missing ${a.label}`);

  if (ok.length === 0)
    return { verdict: 'MISSING', satisfied: 0, total: positives.length, failures };
  if (ok.length < positives.length) {
    return { verdict: 'PARTIAL', satisfied: ok.length, total: positives.length, failures };
  }
  for (const a of negatives) {
    if (!holds(a, cat)) failures.push(`${a.label} should be gone but still exists`);
  }
  if (failures.length > 0) {
    return { verdict: 'PARTIAL', satisfied: ok.length, total: positives.length, failures };
  }
  return { verdict: 'APPLIED', satisfied: ok.length, total: positives.length, failures };
}

interface Reconciliation {
  plans: MigrationPlan[];
  renames: Array<{ from: string; to: string }>;
  orphans: string[];
  blocked: MigrationPlan[];
}

/**
 * Keep only the assertions that survive every LATER migration.
 *
 * A migration's own net effect is not observable on its own: `init` creates the
 * index `number_sequences_prefix_key`, and a migration four steps later drops it.
 * Probing for that index on a fully-migrated database finds nothing, which read as
 * "init is only partially applied" and blocked the whole run. Folding the chain in
 * order (last write wins) leaves each migration asserting only what a
 * fully-migrated database would still show.
 */
export function filterToNetEffect(perMigration: Array<{ assertions: Assertion[] }>): Assertion[][] {
  const final = new Map<string, boolean>();
  for (const m of perMigration) {
    for (const a of m.assertions) final.set(`${a.kind}:${a.key}`, a.expect);
  }
  return perMigration.map((m) =>
    m.assertions.filter((a) => final.get(`${a.kind}:${a.key}`) === a.expect)
  );
}

export function reconcile(
  migrations: Array<{ name: string; sql: string; checksum: string }>,
  dbRows: DbRow[],
  cat: Catalog
): Reconciliation {
  const byName = new Map(dbRows.map((r) => [r.migration_name, r]));

  // Pass 1 - verdict per migration from the catalog alone, using only the
  // assertions a fully-migrated database would still satisfy.
  const derived = migrations.map((mig) => deriveAssertions(mig.sql));
  const effective = filterToNetEffect(derived);
  const raw = migrations.map((mig, i) => ({
    mig,
    ...verdictFor(effective[i], cat, derived[i].hasDdl, derived[i].hasDml),
  }));

  // Pass 2 - high-water mark. Migrations run in order, so if #12's objects exist,
  // #1..#11 must have run too. That is what rescues the ones whose net effect is
  // not observable (enum swaps, ALTER COLUMN, empty migrations).
  let hwm = -1;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].verdict === 'APPLIED') hwm = i;
  }
  // A row recorded as finished is proof too, even when the DDL is unobservable.
  for (let i = 0; i < raw.length; i++) {
    const row = byName.get(raw[i].mig.name);
    if (row?.finished_at && !row.rolled_back_at && i > hwm) hwm = i;
  }

  const plans: MigrationPlan[] = [];
  const renames: Array<{ from: string; to: string }> = [];
  const blocked: MigrationPlan[] = [];

  for (let i = 0; i < raw.length; i++) {
    const { mig, satisfied, total, failures } = raw[i];
    let verdict = raw[i].verdict;

    if (i < hwm && (verdict === 'UNKNOWN' || verdict === 'NO_OP')) {
      verdict = 'APPLIED_INFERRED';
    }

    const row = byName.get(mig.name);
    let action: Action = 'none';
    let detail = '';

    const provenApplied = verdict === 'APPLIED' || verdict === 'APPLIED_INFERRED';

    if (!row) {
      if (provenApplied) {
        action = 'resolve-applied';
        detail =
          verdict === 'APPLIED'
            ? `${satisfied}/${total} objects already in the database`
            : 'unverifiable, but a later migration is provably applied';
      } else if (verdict === 'MISSING' || verdict === 'DATA_ONLY') {
        action = 'deploy';
        detail =
          verdict === 'DATA_ONLY'
            ? 'data-only migration - migrate deploy will RUN it (must be idempotent)'
            : 'not applied yet - migrate deploy will run it';
      } else if (verdict === 'NO_OP') {
        // Only reachable when nothing later is provably applied (otherwise the
        // high-water mark already promoted it to APPLIED_INFERRED) - i.e. a fresh
        // install. Leave it to deploy so a brand-new database is never touched here.
        action = 'deploy';
        detail = 'empty migration - migrate deploy will record it';
      } else if (verdict === 'UNKNOWN') {
        action = 'deploy';
        detail = 'no observable objects and nothing later is applied - deploy will run it';
      } else {
        action = 'block';
        detail = `partially applied: ${failures.join('; ')}`;
      }
    } else if (row.rolled_back_at) {
      if (provenApplied) {
        action = 'resolve-applied';
        detail = 'marked rolled back but the objects are present';
      } else {
        action = 'deploy';
        detail = 'marked rolled back - migrate deploy will re-run it';
      }
    } else if (!row.finished_at) {
      // Prisma's "failed migration" state (P3009). deploy refuses until it is resolved.
      if (provenApplied) {
        action = 'resolve-applied';
        detail = 'failed migration, but its objects are present - marking applied';
      } else if (verdict === 'MISSING') {
        action = 'resolve-rolled-back';
        detail = 'failed migration and none of its objects exist - marking rolled back to retry';
      } else {
        action = 'block';
        detail = `failed migration, partially applied: ${failures.join('; ')}`;
      }
    } else if (row.checksum !== mig.checksum) {
      if (provenApplied) {
        action = 'fix-checksum';
        detail = 'migration.sql was edited after it was applied - realigning checksum';
      } else {
        action = 'block';
        detail = 'checksum differs and the objects are not all present - edited migration';
      }
    } else {
      action = 'none';
      detail = 'already applied';
    }

    const plan: MigrationPlan = {
      name: mig.name,
      checksum: mig.checksum,
      verdict,
      satisfied,
      total,
      failures,
      action,
      detail,
    };
    plans.push(plan);
    if (action === 'block') blocked.push(plan);
  }

  // Rows in the database that have no folder. A checksum match against an
  // unrecorded migration means the folder was renamed - repairable by name.
  const diskNames = new Set(migrations.map((m) => m.name));
  const orphans: string[] = [];
  for (const row of dbRows) {
    if (diskNames.has(row.migration_name)) continue;
    const twin = migrations.find((m) => m.checksum === row.checksum && !byName.has(m.name));
    if (twin) {
      renames.push({ from: row.migration_name, to: twin.name });
      const p = plans.find((x) => x.name === twin.name);
      if (p && p.action === 'resolve-applied') {
        p.action = 'rename-row';
        p.detail = `same content as recorded "${row.migration_name}" - folder was renamed`;
      }
    } else {
      orphans.push(row.migration_name);
    }
  }

  return { plans, renames, orphans, blocked };
}

// ----------------------------------------------------------------- backup

function pgDumpBinary(): string | null {
  const explicit = process.env.PG_DUMP_PATH;
  if (explicit && fs.existsSync(explicit)) return explicit;
  const local = [
    path.join(process.cwd(), 'tools', 'pg_dump.exe'),
    process.env.VB_HOME ? path.join(process.env.VB_HOME, 'app', 'tools', 'pg_dump.exe') : null,
  ].filter(Boolean) as string[];
  for (const p of local) if (fs.existsSync(p)) return p;
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['pg_dump'], {
    encoding: 'utf-8',
  });
  if (which.status === 0) {
    const first = which.stdout.split(/\r?\n/).find(Boolean);
    if (first) return first.trim();
  }
  return null;
}

function takeBackup(databaseUrl: string, backupDir: string): string {
  const exe = pgDumpBinary();
  if (!exe) {
    throw new Error(
      'pg_dump not found. Install the PostgreSQL client tools, set PG_DUMP_PATH, ' +
        'or re-run with --no-backup if you have taken one yourself.'
    );
  }
  fs.mkdirSync(backupDir, { recursive: true });
  // Same shape as the updater's Invoke-PgDumpBackup (yyyy-MM-dd_HHmmss), so these
  // dumps sort and read identically in the Settings backup list.
  const d = new Date();
  const p2 = (n: number) => String(n).padStart(2, '0');
  const ts =
    `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}` +
    `_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
  const out = path.join(backupDir, `car_stock_${ts}_pre-resolve.dump`);
  const res = spawnSync(exe, [`--dbname=${databaseUrl}`, '-Fc', '-f', out], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (res.status !== 0) {
    throw new Error(`pg_dump failed (exit ${res.status}): ${res.stderr || res.stdout}`);
  }
  if (!fs.existsSync(out) || fs.statSync(out).size === 0) {
    throw new Error(`pg_dump produced no output at ${out}`);
  }
  return out;
}

// ------------------------------------------------------------------- main

const MIGRATIONS_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id"                    VARCHAR(36) PRIMARY KEY NOT NULL,
  "checksum"              VARCHAR(64) NOT NULL,
  "finished_at"           TIMESTAMPTZ,
  "migration_name"        VARCHAR(255) NOT NULL,
  "logs"                  TEXT,
  "rolled_back_at"        TIMESTAMPTZ,
  "started_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count"   INTEGER NOT NULL DEFAULT 0
)`;

function describe(p: MigrationPlan): string {
  const tag = {
    none: '  ok    ',
    'resolve-applied': '  RESOLVE',
    'resolve-rolled-back': '  RETRY  ',
    'fix-checksum': '  CHECKSUM',
    'rename-row': '  RENAME ',
    deploy: '  DEPLOY ',
    block: '  BLOCKED',
  }[p.action];
  return `${tag}  ${p.name}  [${p.verdict}] ${p.detail}`;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!opts.databaseUrl) {
    console.error('ERROR: DATABASE_URL not set and no config\\.env / apps/api/.env found.');
    process.exit(1);
  }

  const migrations = readMigrations(opts.migrationsDir);
  const { url, schema } = normalizeDatabaseUrl(opts.databaseUrl);
  const sql = new SQL(url);

  try {
    // Every catalog probe below filters on current_schema(), so the search_path has
    // to be the schema Prisma migrates into, not whatever the role defaults to.
    await sql.unsafe(`SET search_path TO "${schema.replace(/"/g, '""')}"`);
    await sql.unsafe(MIGRATIONS_TABLE_DDL);
    const dbRows = (await sql.unsafe(
      `select migration_name, checksum, finished_at, rolled_back_at
         from "_prisma_migrations" order by started_at`
    )) as DbRow[];
    const cat = await loadCatalog(sql);
    const result = reconcile(migrations, dbRows, cat);

    if (opts.json) {
      console.log(JSON.stringify({ ...result, applied: false }, null, 2));
    } else {
      console.log(`\nMigrations folder : ${opts.migrationsDir}`);
      console.log(`On disk           : ${migrations.length}`);
      console.log(`Recorded in DB    : ${dbRows.length}\n`);
      for (const p of result.plans) console.log(describe(p));
      for (const o of result.orphans) {
        console.log(`  ORPHAN   ${o}  recorded in the database but no folder on disk (left alone)`);
      }
      console.log('');
    }

    const todo = result.plans.filter(
      (p) => p.action !== 'none' && p.action !== 'deploy' && p.action !== 'block'
    );
    const willDeploy = result.plans.filter((p) => p.action === 'deploy');

    if (result.blocked.length > 0) {
      console.error(
        `BLOCKED: ${result.blocked.length} migration(s) are partially applied. Auto-resolving them would strand the missing half. Fix the schema by hand, then re-run.`
      );
      for (const b of result.blocked) console.error(`  - ${b.name}: ${b.failures.join('; ')}`);
      process.exit(3);
    }

    if (todo.length === 0) {
      console.log(
        willDeploy.length > 0
          ? `Nothing to reconcile. ${willDeploy.length} migration(s) will be applied by migrate deploy.`
          : 'Nothing to reconcile - _prisma_migrations already matches the database.'
      );
      process.exit(0);
    }

    if (!opts.apply) {
      console.log(
        `${todo.length} bookkeeping change(s) pending. Re-run with --apply to write them.`
      );
      process.exit(0);
    }

    if (opts.backup) {
      const dir =
        opts.backupDir ??
        (process.env.VB_HOME
          ? path.join(process.env.VB_HOME, 'data', 'backups')
          : path.join(process.cwd(), 'backups'));
      try {
        // pg_dump goes through libpq, which rejects ?schema=public just like Bun's
        // client does - hand it the sanitised URL too.
        const file = takeBackup(url, dir);
        console.log(`Backup: ${file} (${(fs.statSync(file).size / 1024 / 1024).toFixed(1)} MB)`);
      } catch (err) {
        console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(4);
      }
    } else {
      console.log('Backup skipped (--no-backup).');
    }

    // One transaction: either _prisma_migrations ends up consistent or it is untouched.
    await sql.begin(async (tx: SQL) => {
      for (const p of result.plans) {
        switch (p.action) {
          case 'rename-row': {
            const from = result.renames.find((r) => r.to === p.name)?.from;
            if (!from) throw new Error(`rename source lost for ${p.name}`);
            await tx`update "_prisma_migrations"
                        set migration_name = ${p.name}, checksum = ${p.checksum}
                      where migration_name = ${from}`;
            break;
          }
          case 'fix-checksum':
            await tx`update "_prisma_migrations"
                        set checksum = ${p.checksum}
                      where migration_name = ${p.name}`;
            break;
          case 'resolve-rolled-back':
            await tx`update "_prisma_migrations"
                        set rolled_back_at = now()
                      where migration_name = ${p.name} and finished_at is null`;
            break;
          case 'resolve-applied':
            // Same row `prisma migrate resolve --applied` writes: checksum is the
            // sha256 of migration.sql, applied_steps_count 1, finished now.
            await tx`delete from "_prisma_migrations" where migration_name = ${p.name}`;
            await tx`insert into "_prisma_migrations"
                       (id, checksum, finished_at, migration_name, logs, rolled_back_at,
                        started_at, applied_steps_count)
                     values (${crypto.randomUUID()}, ${p.checksum}, now(), ${p.name},
                             ${'resolved by auto-resolve-migrations'}, null, now(), 1)`;
            break;
          default:
            break;
        }
      }
    });

    console.log(`\nReconciled ${todo.length} migration record(s).`);
    if (willDeploy.length > 0) {
      console.log(`${willDeploy.length} migration(s) still need to be applied:`);
      for (const p of willDeploy) console.log(`  - ${p.name}`);
      console.log('Run `prisma migrate deploy` next.');
    }
    process.exit(0);
  } finally {
    await sql.end();
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
