import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const sql = readFileSync(new URL('../supabase/preflight/paddle_sandbox_preflight.sql', import.meta.url), 'utf8');
const rows = results => results.flatMap(r => r.rows);
test('preflight runs read-only against an empty local schema and reports missing prerequisites', async () => {
 const db = new PGlite();
 try {
  const result = rows(await db.exec(sql));
  assert.equal(result.find(r => r.section === '01_context').read_only, 'on');
  assert.ok(result.some(r => r.result === 'BLOCK_MISSING'));
  assert.ok(result.some(r => r.result === 'BLOCK_NO_APPLICABLE_PERMISSIVE_POLICY'));
  const tables = await db.query("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'");
  assert.equal(tables.rows[0].n,0);
 } finally { await db.close(); }
});
test('preflight detects schema drift, collisions, column/PUBLIC grants and status dependencies without reading records', async () => {
 const db = new PGlite();
 try {
  // Synthetic metadata fixture only. No target migration, production connection or application data.
  await db.exec(`
   CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
   CREATE SCHEMA auth;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT NULL::uuid$$;
   CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT 'authenticated'::text$$;
   CREATE TYPE public.plan_tier AS ENUM ('Free','Pro','Business');
   CREATE TABLE profiles(id uuid PRIMARY KEY);
   CREATE TABLE user_roles(user_id uuid PRIMARY KEY,role text,created_at timestamptz);
   CREATE FUNCTION is_admin() RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$SELECT false$$;
   CREATE TABLE user_subscriptions(id uuid PRIMARY KEY,user_id uuid UNIQUE,status text,
    plan_tier public.plan_tier,subscription_source text CHECK(subscription_source IN ('legacy')));
   CREATE VIEW status_view AS SELECT status FROM user_subscriptions;
   CREATE TABLE payment_transactions(user_id uuid);
   CREATE TABLE faq_collections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,title text,
    unexpected_required text NOT NULL);
   CREATE TABLE faqs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),collection_id uuid,question text,
    answer text,order_index integer,is_published boolean);
   CREATE TABLE usage_analytics(user_id uuid,action_type text NOT NULL,action text,metadata jsonb);
   ALTER TABLE faq_collections ENABLE ROW LEVEL SECURITY;
   CREATE POLICY scoped ON faq_collections FOR ALL TO authenticated USING(user_id=auth.uid());
   GRANT SELECT,INSERT,UPDATE ON user_subscriptions TO PUBLIC;
   GRANT UPDATE(status) ON user_subscriptions TO authenticated;
   CREATE TABLE paddle_events(event_id text PRIMARY KEY);
   CREATE SCHEMA supabase_migrations;
   CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,statements text[]);
   INSERT INTO supabase_migrations.schema_migrations VALUES ('20261022000000',ARRAY['SYNTHETIC_PRIVATE_HISTORY_MARKER']);
  `);
  const result=rows(await db.exec(sql));
  assert.ok(result.some(r => r.section==='03_columns' && r.column_name==='plan_tier' && r.result==='BLOCK_TYPE_REVIEW'));
  assert.ok(result.some(r => r.section==='04_insert_requirements' && r.column_name==='unexpected_required'));
  assert.ok(!result.some(r => r.section==='04_insert_requirements' && r.table_name==='usage_analytics'));
  assert.ok(result.some(r => r.section==='03_columns' && r.column_name==='current_period_end' && r.result==='EXPECTED_ADDITION'));
  assert.ok(result.some(r => r.section==='05_unique_keys' && r.table_name==='user_subscriptions' && r.column_name==='user_id' && r.result.startsWith('UNIQUE_NULLABLE_LEGACY_OWNER')));
  assert.ok(result.some(r => r.section==='08_status_dependencies' && r.dependent_object.includes('status_view')));
  assert.ok(result.some(r => r.section==='09_new_object_collisions' && r.name==='paddle_events' && r.result.startsWith('BLOCK')));
  assert.ok(result.some(r => r.section==='14_explicit_table_and_column_acl' && r.column_name==='status'));
  assert.ok(result.some(r => r.section==='14_explicit_table_and_column_acl' && r.grantee==='PUBLIC'));
  assert.ok(result.some(r => r.section==='15_policy_coverage' && r.table_name==='faq_collections' && r.result==='REVIEW_POLICY_SEMANTICS'));
  assert.ok(!JSON.stringify(result).includes('SYNTHETIC_PRIVATE_HISTORY_MARKER'));
  assert.equal((await db.query('select count(*)::int n from supabase_migrations.schema_migrations')).rows[0].n,1);
 } finally { await db.close(); }
});
test('preflight contains no application-table reads, RPC calls, credential sources or persistent mutations', () => {
 assert.match(sql,/BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/);
 assert.match(sql,/ROLLBACK;\s*$/);
 assert.doesNotMatch(sql,/\b(?:CREATE|ALTER|DROP|GRANT|REVOKE|INSERT|UPDATE|DELETE|TRUNCATE)\s+(?:TABLE|FUNCTION|POLICY|ROLE|INTO|ON|FROM)/i);
 assert.doesNotMatch(sql,/\b(?:FROM|JOIN)\s+(?:public|auth|storage)\./i);
 assert.doesNotMatch(sql,/\b(?:prosrc|pg_authid|rolpassword|decrypted_secrets|pg_get_functiondef)\b/i);
});
