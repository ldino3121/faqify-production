# Supabase preflight and backup preparation

Subsequent status: the backup and isolated restore verification are complete. The three blockers found on that snapshot have been resolved in the pending migration and rehearsed locally; see [MIGRATION_REHEARSAL.md](MIGRATION_REHEARSAL.md). The original preparation evidence and backup instructions below are historical. Production has not been migrated.

The owner has selected the existing production Supabase project for Paddle sandbox testing. This records that decision; it does not authorize this preparation task to migrate, deploy, or change remote configuration. Later sandbox fulfillment will affect accounts and quota in that same database. The original setup document's staging recommendation is superseded for this chosen target.

## Current evidence

- Branch: `integration/paddle-sandbox`.
- Cached native Supabase CLI: version 2.62.5 at `/Users/carbonface/.npm/_npx/b96a6bd565c470ce/node_modules/.bin/supabase`. It runs locally. CLI help advertises an available newer version; no upgrade was made. This cache path can disappear; pin/install a tested CLI before a repeatable backup workflow.
- macOS Keychain has the default `Supabase CLI` / `supabase` entry. Only entry metadata was requested, not its value. Token validity, identity and permissions have not been tested.
- No `supabase/.temp/project-ref` or `.branches` state exists in this checkout. No link was created. The config's local project ID and historical public URLs do not establish the intended cloud database.
- `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`, `SUPABASE_URL` and `DATABASE_URL` are absent from the current process. No `.pgpass` or `.pg_service.conf` was found in the default home location. No credential file was copied or printed.
- Docker CLI 29.7.2 is available; its daemon socket is absent. `psql`, `pg_dump`, `pg_restore` and `pg_config` are not on PATH. The repository's `supabase.exe` is a Windows executable, not usable native tooling on this Mac.
- No connection to a Supabase project or production database was made; no actual-database preflight or backup has been completed.

## Run the metadata-only preflight

Script: [`supabase/preflight/paddle_sandbox_preflight.sql`](../supabase/preflight/paddle_sandbox_preflight.sql).

First open the intended production project in the Supabase Dashboard and independently confirm its project reference/name. In that project's SQL Editor, run the complete script as the database owner/intended migration executor. It starts a repeatable-read, read-only transaction with bounded timeouts and ends with `ROLLBACK`. If a statement fails, end the failed transaction with `ROLLBACK`; do not treat incomplete output as a pass. No project is selected or linked by this script.

The numbered resultsets check prerequisite tables and field types, optional added columns, required INSERT defaults, unique/non-null reference keys, the plan enum, constraint inventories, status-type dependencies, collisions with new tables/indexes/functions, function signatures and parameter names, security-definer/search-path flags, roles, table/column/function/schema privileges, RLS and policy coverage, default ACLs, triggers and migration-history drift. The history check reads only version metadata and emits a NOTICE; retain that notice along with all SELECT resultsets. It compares the 24 local versions, explicitly checks `20261022000000`, and reports missing/extra/duplicate/nonstandard history. If the SQL Editor hides notices, run the same script using a confirmed psql connection later, or retain the notice from the editor's message pane. Do not retrieve the history table's `statements` column.

No user records, provider secrets, vault values, role passwords, function source or default/policy/constraint text are returned. Constraint/policy fingerprints and marker checks cannot establish semantic safety: definitions require a separate private review. The script does not call `is_admin()`, quota functions or other application RPCs. Tests use synthetic in-memory databases, never the target migration or a remote database. Run `npm run test:preflight`; the suite also runs under `npm test`. All 93 tests (64 application, 26 catalog, three preflight) passed after this preparation.

Interpretation:

- `BLOCK_*`: stop rollout and resolve the mismatch. Existing Paddle objects or a recorded target version mean inspect partial/already-applied state; do not rerun the migration blindly.
- `EXPECTED_ADDITION` / `AVAILABLE` / `WILL_CREATE`: expected absence before the migration.
- `REVIEW_*`: inspect before proceeding, not a pass. Existing billing policies are all replaced; collection/FAQ ownership policies survive. Existing-table RLS is not enabled by the new migration. Table-level revokes do not clear existing column grants, PUBLIC grants or grants inherited through another role.
- Enum-valued fields receiving SQL text assignments, retained CHECK constraints, unexpected required INSERT fields, status-dependent views/policies, changed function return types or parameter names can block rollout. Metadata alone cannot validate stored-data casts/check compatibility; this script deliberately does not inspect data.
- This is not an automatic GO gate. Confirm live-schema compatibility, a demonstrated restore, and coordinated frontend/function/migration timing separately. Do not replay historical migrations or use `db reset` against the chosen database.

## Exact next backup step

**Start Docker Desktop on this Mac, then run `docker info --format '{{.ServerVersion}}'` to confirm the daemon is available. In the explicitly confirmed production project's Dashboard → Connect, obtain the Session pooler connection details and existing database password privately. Do not reset a password or link to an inferred project.** No backup command can be targeted safely until that identity/connection is confirmed. The SQL Editor can run the metadata preflight independently of Docker.

The following is a prepared procedure, not commands executed by this task. Use a private terminal with tracing disabled. Store the connection URL in a masked shell variable (no literal password in shell history), preserve percent-encoding of the password, use TLS, and never paste the URL here. A CLI management token/service-role API key is not a database password. Use Session pooler or a confirmed reachable direct connection, not transaction pooling. The connection argument is visible to local process inspection while the CLI runs; use only a trusted local session and do not record process/debug output.

Create a unique backup directory outside this repository with mode 700 and `umask 077`; protect/encrypt and restrict access to the exported files and logs. Exporting data is a future, separate operation: it necessarily contains production records and has not been performed under this metadata-only task.

After setting `FAQIFY_BACKUP_DB_URL` privately and setting `FAQIFY_BACKUP_DIR` to that new directory, these are the exact first export and subsequent pieces, based on the locally inspected CLI flags:

```sh
(
set -eu
set +x
umask 077
: "${FAQIFY_BACKUP_DB_URL:?Set the confirmed connection privately}"
: "${FAQIFY_BACKUP_DIR:?Set a new protected backup directory}"
FAQIFY_SUPABASE_CLI=/Users/carbonface/.npm/_npx/b96a6bd565c470ce/node_modules/.bin/supabase
"$FAQIFY_SUPABASE_CLI" db dump --db-url "$FAQIFY_BACKUP_DB_URL" --role-only --file "$FAQIFY_BACKUP_DIR/roles.sql"
"$FAQIFY_SUPABASE_CLI" db dump --db-url "$FAQIFY_BACKUP_DB_URL" --file "$FAQIFY_BACKUP_DIR/schema.sql"
"$FAQIFY_SUPABASE_CLI" db dump --db-url "$FAQIFY_BACKUP_DB_URL" --data-only --use-copy --file "$FAQIFY_BACKUP_DIR/data.sql"
"$FAQIFY_SUPABASE_CLI" db dump --db-url "$FAQIFY_BACKUP_DB_URL" --schema supabase_migrations --file "$FAQIFY_BACKUP_DIR/history_schema.sql"
"$FAQIFY_SUPABASE_CLI" db dump --db-url "$FAQIFY_BACKUP_DB_URL" --schema supabase_migrations --data-only --use-copy --file "$FAQIFY_BACKUP_DIR/history_data.sql"
)
```

Stop if any command fails; retain protected logs and inspect them privately, never upload dump contents. Record exit statuses, timestamps, confirmed project identity, server/CLI versions and SHA-256 checksums in a private manifest. Checksum success or a nonempty file is not evidence of recoverability. The CLI files use separate snapshots: arrange an approved quiet window with no schema changes and appropriate write coordination, or use a reviewed consistent-snapshot alternative; don't claim that several independent dumps form an atomic recovery point. [Supabase's backup/restore procedure](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) documents schema, roles, COPY data and separate history exports. Inspect whether the current schema needs that guide's vector-table exclusions rather than omitting tables blindly.

A full recovery inventory also needs managed-schema customizations, enabled extensions/publications, role recreation, external Storage objects, application/function configuration and any encryption prerequisites. Record existing Dashboard backup/PITR availability and retention without changing it. Database backups preserve Storage metadata, not file contents; export the actual objects separately if needed. [Supabase backup scope](https://supabase.com/docs/guides/platform/backups).

## Verify the backup can restore

Prepare an explicitly separate disposable restore target compatible with the source Supabase/Postgres version and extensions; it must have no production provider/webhook destinations or outbound job effects. Restore testing is not authorized/executed by this task. A plain PostgreSQL container does not supply Supabase's managed schemas, roles and extensions automatically. A separate Supabase-compatible clone is preferable for application recovery verification.

Use a matching PostgreSQL client in a Docker image, or install native clients separately after review. For logical SQL files, restore through `psql -X --set ON_ERROR_STOP=1 --single-transaction`, in reviewed dependency order: roles, schema, COPY data, then the separately preserved history. Follow the managed-target adjustments in Supabase's guide, including custom `auth`/`storage` objects and encryption prerequisites where applicable. Never send these commands to the source project. Protect restore logs: errors can contain record values. Do not suppress failures and declare a partial restore successful.

On the disposable target, compare schema/constraints/indexes/triggers, RLS/policies/grants, sequence state and history metadata; verify aggregate counts/integrity privately without exposing records, then run application smoke checks against that target. Rerun this preflight there. Record successful restore evidence before calling the backup restorable. Physical/PITR restore paths require their own rehearsal. A `pg_restore --list` inventory alone is not a restore test; it applies to pg_dump archives, not these plain SQL exports. [PostgreSQL dump formats](https://www.postgresql.org/docs/current/app-pgdump.html), [restore behavior](https://www.postgresql.org/docs/current/app-pgrestore.html).

## Remaining React Router runtime finding

The lockfile has `react-router` and `react-router-dom` **6.30.6**. The moderate [backslash open-redirect advisory](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6) affects `react-router >=6.0.0 <7.18.0`: attacker-controlled paths reaching `<Link>`/`useNavigate` can be interpreted as external navigation. The inspected login/checkout/protected-route paths are fixed internal destinations; no exploit path was demonstrated, but the installed runtime remains affected. This is a scoped source inspection, not a proof about every navigation callsite.

The paired moderate [constructor-injection advisory](https://github.com/advisories/GHSA-337j-9hxr-rhxg) affects `>=6.4.0 <7.18.0` through SSR error hydration; no SSR hydration path was found in this Vite SPA. It is not the same exposure as client navigation.

**Smallest upstream fixed version for both is 7.18.0**, so the smallest dependency change is a reviewed `react-router-dom@7.18.0` upgrade that resolves matching `react-router@7.18.0` (update a direct `react-router` declaration too if one is later added). There is no patched 6.x version listed by these advisories. Review routing behavior and test auth redirects, lazy routes, relative paths and checkout navigation before accepting the major update. No dependency upgrade was made in this preflight task.
