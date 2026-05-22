-- Data migration: backfill payments.issued_by
--
-- Context:
--   An older payment-create flow interpolated `${currentUser.firstName}
--   ${currentUser.lastName}` from the JWT payload, which only carries
--   id/username/role -- so both fields were undefined and the column was
--   stored as the literal string "undefined undefined".
--   The current create flow (payments.service.ts) fetches the user from the
--   DB with a username fallback, so no new rows are affected.
--
-- This migration recovers the correct name from the intact `createdBy`
-- relation (created_by_id -> users) for rows broken by the old flow.
--
-- Safety:
--   * Non-destructive -- the WHERE clause only matches already-broken rows
--     ("undefined undefined", NULL, or empty). Valid names are never touched.
--   * Idempotent -- after the first run no rows match, so re-running is a
--     no-op.
--   * Recovers data from the same database (users table); nothing external.

UPDATE "payments" p
SET "issued_by" = COALESCE(
  NULLIF(TRIM(CONCAT_WS(' ', u."first_name", u."last_name")), ''),
  u."username"
)
FROM "users" u
WHERE u."id" = p."created_by_id"
  AND (
    p."issued_by" ILIKE '%undefined%'
    OR p."issued_by" IS NULL
    OR p."issued_by" = ''
  );
