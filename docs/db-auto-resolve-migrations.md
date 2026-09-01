# Auto-resolve migrations

`apps/api/scripts/auto-resolve-migrations.ts` (shipped as `app\scripts\auto-resolve-migrations.ts`)
reconciles the `_prisma_migrations` bookkeeping table with what is actually in the database,
so `prisma migrate deploy` can run to completion on an install that has drifted.

It runs automatically:

- **`setup.bat`** — before `migrate deploy`, and takes a `pg_dump` first.
- **the updater, step 8 (Migrate)** — before `migrate deploy`, with `--no-backup` because
  step 5 already took the pre-update dump.

## The problem it solves

A customer database drifts away from the migration history when someone runs `db push`,
restores a dump taken before migrations existed, renames a migration folder, or leaves a
migration half-applied. Prisma then refuses to move:

| Symptom | Prisma code |
|---|---|
| schema is not empty but `_prisma_migrations` is missing/empty | P3005 |
| a migration is recorded as started but never finished | P3009 |
| a migration re-runs DDL that is already there | `relation ... already exists` |

The documented fix is `prisma migrate resolve --applied <name>`, once per migration, decided
by hand. That is not something a dealership's server operator is going to work out.

## How it decides

For each migration folder, in order:

1. Parse `migration.sql` and derive the objects that must exist afterwards — tables,
   columns, indexes, constraints, enum types and enum values. Statements are folded in
   order, so `DROP CONSTRAINT x` followed by `ADD CONSTRAINT x` nets out to "x exists".
2. Fold the assertions across the **whole chain**, so an object a later migration drops is
   no longer asserted by the migration that created it. (Without this, `init` looked
   partially applied forever, because it creates `number_sequences_prefix_key` and a later
   migration drops it.)
3. Probe the PostgreSQL catalog and compare.

| Verdict | Meaning | Action |
|---|---|---|
| `APPLIED` | every object it creates is present | record it as applied |
| `APPLIED_INFERRED` | unverifiable, but a **later** migration is provably applied | record it as applied |
| `MISSING` | none of its objects are present | leave it to `migrate deploy` |
| `PARTIAL` | some present, some not | **stop** — exit 3 |
| `DATA_ONLY` | pure `INSERT`/`UPDATE`/`DELETE` | leave it to `migrate deploy`, which re-runs it |
| `NO_OP` | empty migration | leave it to `migrate deploy` |

Only **positive** assertions count as evidence. "Type `SaleStatus_new` does not exist" is
equally true before and after the enum-swap migration runs, so a migration whose net effect
is only removals falls back to the high-water-mark rule instead.

Two deliberate refusals:

- **Partially applied → stop.** Marking it applied would strand the missing objects forever.
  The exact missing object is printed; fix it by hand and re-run.
- **Data-only → never assumed applied.** Re-running an idempotent backfill is recoverable;
  silently skipping one is not. Check that any data migration you write is idempotent.

An orphan row (in the database, no folder on disk) whose **checksum matches** an unrecorded
migration is a renamed folder, and is repaired by name. Any other orphan is reported and
left alone — rows are never deleted.

## Safety

- Writes **only** `_prisma_migrations` rows, inside one transaction. No DDL, no `DROP`,
  no data change, never `migrate reset`.
- Takes a `pg_dump -Fc` before writing anything (unless `--no-backup`). If `pg_dump` is
  missing it exits 4 rather than proceeding.
- Exits **before** the backup step when there is nothing to reconcile, so a fresh install
  never needs `pg_dump`.
- The checksum it writes is the sha256 of `migration.sql` — byte-identical to what
  `prisma migrate resolve --applied` writes.

## Usage

```bash
# plan only, read-only - this is the default
bun apps/api/scripts/auto-resolve-migrations.ts

# back up, then write the bookkeeping rows
bun apps/api/scripts/auto-resolve-migrations.ts --apply

# then, as always
cd apps/api && bunx prisma migrate deploy
```

Flags: `--apply`, `--no-backup`, `--backup-dir <dir>`, `--migrations <dir>`,
`--database-url <url>`, `--json`.

`DATABASE_URL` is read from the environment, then `%VB_HOME%\config\.env`, then
`apps/api/.env`. Prisma-only query parameters (`?schema=public`, `connection_limit`, …) are
stripped before connecting — PostgreSQL rejects them — and `schema` is applied as
`search_path` instead.

| Exit | Meaning |
|---|---|
| 0 | nothing to do, or reconciled successfully |
| 1 | error (bad `DATABASE_URL`, cannot connect) |
| 3 | blocked: a migration is partially applied — needs a human |
| 4 | backup failed |

`setup.bat` and the updater abort on 3 and 4. Any other non-zero exit is logged as a
warning and `migrate deploy` still runs, so a failure here can never be worse than not
having the script at all.
