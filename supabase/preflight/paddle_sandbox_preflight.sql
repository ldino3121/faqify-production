-- FAQify preflight for 20261022000000_paddle_and_atomic_faq_saves.sql.
-- Run ONLY in the explicitly confirmed project's SQL Editor or an authenticated psql session.
-- Metadata only: never calls application RPCs or reads application/auth/storage rows.
-- Routine bodies, defaults, policy/constraint expressions, role passwords and migration SQL
-- are deliberately NOT returned. Expression hashes/markers are not a semantic security audit.
-- No automatic GO decision: review every BLOCK/REVIEW, backup/restore evidence and rollout plan.
-- ROLLBACK always ends this script. Run as the intended migration/database owner for useful ACL checks.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '3s';

SELECT '01_context' AS section, current_setting('server_version_num') AS server_version_num,
       current_setting('transaction_read_only') AS read_only,
       current_setting('transaction_isolation') AS isolation,
       'Metadata only; connected project identity must be verified in the dashboard, not inferred here.' AS note;

WITH required(name) AS (VALUES ('profiles'),('user_subscriptions'),('payment_transactions'),
 ('faq_collections'),('faqs'),('usage_analytics'),('user_roles'))
SELECT '02_required_tables' AS section, r.name AS table_name,
 CASE WHEN c.oid IS NULL THEN 'BLOCK_MISSING' WHEN c.relkind NOT IN ('r','p') THEN 'BLOCK_NOT_TABLE' ELSE 'PRESENT' END AS result,
 c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS force_rls,
 CASE WHEN c.oid IS NOT NULL THEN pg_has_role(current_user,c.relowner,'USAGE') END AS executor_inherits_owner,
 CASE WHEN r.name IN ('user_subscriptions','payment_transactions','faq_collections','faqs','user_roles')
      AND NOT coalesce(c.relrowsecurity,false) THEN 'BLOCK_REVIEW_RLS: migration does not enable RLS on existing tables' END AS warning
FROM required r LEFT JOIN pg_namespace n ON n.nspname='public'
LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=r.name ORDER BY r.name;

-- New billing/generation ownership follows the existing auth.users FK, not
-- optional profile rows. Only catalog metadata is inspected here.
SELECT '02_auth_account_key' AS section,
 CASE WHEN EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='id' AND NOT a.attisdropped
 JOIN pg_index i ON i.indrelid=c.oid AND i.indisunique AND i.indisvalid
 WHERE n.nspname='auth' AND c.relname='users' AND c.relkind='r'
 AND a.atttypid='uuid'::regtype AND a.attnotnull AND i.indimmediate
 AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indnkeyatts=1 AND i.indkey[0]=a.attnum)
 THEN 'AUTH_ACCOUNT_KEY_PRESENT' ELSE 'BLOCK_MISSING_AUTH_ACCOUNT_KEY' END AS result;

WITH required(table_name,column_name,allowed_types,added_by_migration) AS (VALUES
    ('profiles','id','uuid',false),
    ('user_subscriptions','id','uuid',false),
    ('user_subscriptions','user_id','uuid',false),
    ('user_subscriptions','plan_tier','text|character varying',false),
    ('user_subscriptions','status','text',false),
    ('user_subscriptions','faq_usage_current','integer',false),
    ('user_subscriptions','faq_usage_limit','integer',false),
    ('user_subscriptions','plan_activated_at','timestamp with time zone',false),
    ('user_subscriptions','plan_expires_at','timestamp with time zone',false),
    ('user_subscriptions','current_period_end','timestamp with time zone',true),
    ('user_subscriptions','last_reset_date','timestamp with time zone|date',false),
    ('user_subscriptions','created_at','timestamp with time zone',false),
    ('user_subscriptions','updated_at','timestamp with time zone',false),
    ('user_subscriptions','razorpay_subscription_id','text|character varying',false),
    ('user_subscriptions','auto_renewal','boolean',false),
    ('user_subscriptions','payment_gateway','text|character varying',false),
    ('user_subscriptions','subscription_source','text|character varying',false),
    ('user_subscriptions','payment_type','text|character varying',false),
    ('user_subscriptions','billing_cycle','text|character varying',false),
    ('user_subscriptions','next_billing_date','timestamp with time zone',false),
    ('user_subscriptions','cancelled_at','timestamp with time zone',false),
    ('user_subscriptions','cancellation_reason','text|character varying',false),
    ('user_subscriptions','plan_changed_at','timestamp with time zone',false),
    ('payment_transactions','user_id','uuid',false),
    ('faq_collections','id','uuid',false),
    ('faq_collections','user_id','uuid',false),
    ('faq_collections','title','text|character varying',false),
    ('faq_collections','source_url','text|character varying',false),
    ('faq_collections','source_content','text|character varying',false),
    ('faq_collections','status','text|character varying',false),
    ('faqs','id','uuid',false),
    ('faqs','collection_id','uuid',false),
    ('faqs','question','text|character varying',false),
    ('faqs','answer','text|character varying',false),
    ('faqs','order_index','integer',false),
    ('faqs','is_published','boolean',false),
    ('usage_analytics','user_id','uuid',false),
    ('usage_analytics','action','text|character varying',false),
    ('usage_analytics','action_type','text|character varying',false),
    ('usage_analytics','metadata','jsonb',false),
    ('user_roles','user_id','uuid',false),
    ('user_roles','role','text|character varying',false),
    ('user_roles','created_at','timestamp with time zone',false),
    ('user_subscriptions','plan_id','public.plan_tier',true),
    ('user_subscriptions','paddle_subscription_id','text',true),
    ('user_subscriptions','paddle_customer_id','text',true),
    ('user_subscriptions','paddle_environment','text',true),
    ('user_subscriptions','paddle_state_at','timestamp with time zone',true),
    ('user_subscriptions','paddle_last_payment_at','timestamp with time zone',true),
    ('user_subscriptions','paddle_last_transaction_id','text',true)
), actual AS (
 SELECT c.relname,a.attname,a.attnotnull,a.atthasdef,a.attidentity,a.attgenerated,
        format_type(a.atttypid,a.atttypmod) AS actual_type,
        CASE WHEN t.typtype='e' THEN tn.nspname||'.'||t.typname ELSE format_type(a.atttypid,NULL) END AS base_type
 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_type t ON t.oid=a.atttypid JOIN pg_namespace tn ON tn.oid=t.typnamespace
 WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped
)
SELECT '03_columns' AS section,r.*,a.actual_type,a.attnotnull AS not_null,a.atthasdef AS has_default,
 CASE WHEN a.attname IS NULL AND r.added_by_migration THEN 'EXPECTED_ADDITION'
      WHEN a.attname IS NULL THEN 'BLOCK_MISSING'
      WHEN NOT (a.base_type=ANY(string_to_array(r.allowed_types,'|'))) THEN 'BLOCK_TYPE_REVIEW'
      WHEN coalesce(a.attgenerated,'')<>'' THEN 'BLOCK_GENERATED_COLUMN'
      WHEN r.added_by_migration THEN 'REVIEW_EXISTING_COLUMN: IF NOT EXISTS will preserve its current definition'
      ELSE 'TYPE_MATCH' END AS result
FROM required r LEFT JOIN actual a ON a.relname=r.table_name AND a.attname=r.column_name
ORDER BY r.table_name,r.added_by_migration,r.column_name;

-- Additional NOT NULL fields can break the new INSERTs even when all expected columns exist.
WITH inserts(table_name,inserted_columns) AS (VALUES
 ('faq_collections',ARRAY['user_id','title','source_url','source_content','status']),
 ('faqs',ARRAY['collection_id','question','answer','order_index','is_published']),
 ('usage_analytics',ARRAY['user_id','action_type','action','metadata'])
)
SELECT '04_insert_requirements' AS section,i.table_name,a.attname AS column_name,
 'BLOCK_REQUIRED_COLUMN_NOT_SUPPLIED' AS result
FROM inserts i JOIN pg_class c ON c.relname=i.table_name JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'
JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
WHERE a.attnotnull AND NOT a.atthasdef AND a.attidentity='' AND a.attgenerated=''
AND NOT (a.attname=ANY(i.inserted_columns)) ORDER BY i.table_name,a.attnum;

WITH required(table_name,column_name) AS (VALUES ('profiles','id'),('user_subscriptions','id'),
 ('user_subscriptions','user_id'),('faq_collections','id'),('faqs','id'),('user_roles','user_id'))
SELECT '05_unique_keys' AS section,r.*,
 CASE WHEN EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid=c.oid AND i.indisunique AND i.indisvalid AND i.indimmediate
 AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indnkeyatts=1 AND i.indkey[0]=a.attnum)
 THEN CASE WHEN a.attnotnull THEN 'UNIQUE_NOT_NULL'
           WHEN r.table_name='user_subscriptions' AND r.column_name='user_id'
           THEN 'UNIQUE_NULLABLE_LEGACY_OWNER: preserved; RPCs require a non-null authenticated owner'
           ELSE 'BLOCK_REVIEW_UNIQUENESS_OR_NULLABILITY' END
 ELSE 'BLOCK_REVIEW_UNIQUENESS_OR_NULLABILITY' END AS result
FROM required r LEFT JOIN pg_namespace n ON n.nspname='public'
LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=r.table_name
LEFT JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname=r.column_name AND NOT a.attisdropped;

SELECT '06_plan_enum' AS section,n.nspname AS schema_name,t.typname,
 t.typtype='e' AS is_enum,
 (SELECT count(*)=3 AND bool_and(e.enumlabel=ANY(ARRAY['Free','Pro','Business'])) FROM pg_enum e WHERE e.enumtypid=t.oid) AS expected_labels_only
FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='plan_tier';
SELECT '06_plan_enum_presence' AS section,
 CASE WHEN to_regtype('public.plan_tier') IS NULL THEN 'BLOCK_MISSING_TYPE' ELSE 'REVIEW_ENUM_RESULT_ABOVE' END AS result;

-- Enum targets in fields assigned text by fulfillment are incompatible unless deliberately handled.
-- Character length limits, CHECKs and FKs below need review for paddle/one_time/recurring/refunded values.
SELECT '07_existing_constraints' AS section,c.relname AS table_name,k.conname,k.contype,k.convalidated,
 ARRAY(SELECT a.attname FROM unnest(k.conkey) WITH ORDINALITY x(attnum,ord)
       JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=x.attnum ORDER BY x.ord) AS columns,
 rn.nspname AS referenced_schema,rc.relname AS referenced_table,
 md5(pg_get_constraintdef(k.oid)) AS definition_hash,
 CASE WHEN c.relname='user_subscriptions' AND k.contype='c' AND k.conname='user_subscriptions_status_check'
 THEN 'WILL_REPLACE_STATUS_CHECK: retain legacy states and add Paddle lifecycle states'
 ELSE 'REVIEW_RETAINED_CONSTRAINT: values not sampled' END AS migration_effect
FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_class rc ON rc.oid=k.confrelid LEFT JOIN pg_namespace rn ON rn.oid=rc.relnamespace
WHERE n.nspname='public' AND c.relname IN ('profiles','user_subscriptions','payment_transactions','faq_collections','faqs','usage_analytics','user_roles')
ORDER BY c.relname,k.conname;

SELECT '08_status_dependencies' AS section,d.classid::regclass::text AS dependent_catalog,
 pg_describe_object(d.classid,d.objid,d.objsubid) AS dependent_object,d.deptype,
 'REVIEW: status remains text; only the known status CHECK is widened' AS result
FROM pg_depend d JOIN pg_class c ON c.oid=d.refobjid JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=d.refobjsubid
WHERE d.refclassid='pg_class'::regclass AND n.nspname='public' AND c.relname='user_subscriptions' AND a.attname='status';

WITH new_relations(name,kind) AS (VALUES ('paddle_checkouts','table'),('paddle_customers','table'),
 ('faqify_sandbox_cohort','table'),('paddle_events','table'),('paddle_payments','table'),('faq_generation_requests','table'),
 ('paddle_checkout_user','index'),('faq_requests_rate','index'),('paddle_subscription_owner','index'))
SELECT '09_new_object_collisions' AS section,r.*,
 CASE WHEN to_regclass('public.'||r.name) IS NULL THEN 'AVAILABLE'
 ELSE 'BLOCK_EXISTS: migration is not safe to replay or resume blindly' END AS result
FROM new_relations r;

WITH required(signature,result_type,mode) AS (VALUES
 ('auth.uid()','uuid','PREREQUISITE'),('auth.role()','text','PREREQUISITE'),
 ('public.is_admin()','boolean','PREREQUISITE'),('gen_random_uuid()','uuid','PREREQUISITE'),
 ('public.can_generate_faqs(uuid,integer)','jsonb','REPLACE_OR_CREATE'),
 ('public.reset_monthly_usage()','integer','REPLACE_OR_CREATE'),
 ('public.begin_faq_generation(uuid,integer,text,text)','uuid','NEW'),
 ('public.save_generated_faqs(uuid,text)','jsonb','NEW'),
 ('public.begin_paddle_checkout(uuid,text,text,text,text)','jsonb','NEW'),
 ('public.apply_paddle_event(text,timestamp with time zone,text,jsonb)','text','NEW'))
SELECT '10_function_signatures' AS section,r.*,p.oid::regprocedure::text AS actual_signature,
 p.proargnames AS argument_names,p.pronargdefaults AS default_argument_count,
 CASE WHEN p.oid IS NULL AND r.mode='PREREQUISITE' THEN 'BLOCK_MISSING'
 WHEN p.oid IS NOT NULL AND r.mode='NEW' THEN 'BLOCK_ALREADY_EXISTS'
 WHEN p.oid IS NOT NULL AND (p.prokind<>'f' OR format_type(p.prorettype,NULL)<>r.result_type OR p.proretset) THEN 'BLOCK_SIGNATURE_CONFLICT'
 WHEN p.oid IS NULL THEN 'WILL_CREATE' ELSE 'REVIEW_EXISTING_IMPLEMENTATION_PRIVATELY' END AS result
FROM required r LEFT JOIN pg_proc p ON p.oid=to_regprocedure(r.signature);

-- List every relevant overload: new overloads/default args can cause ambiguous named calls.
SELECT '11_function_metadata' AS section,n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS identity_arguments,
 format_type(p.prorettype,NULL) AS return_type,p.prosecdef AS security_definer,p.provolatile,
 p.proargnames,p.pronargdefaults,
 EXISTS(SELECT 1 FROM unnest(coalesce(p.proconfig,ARRAY[]::text[])) x WHERE x LIKE 'search_path=%') AS fixed_search_path,
 pg_has_role(current_user,p.proowner,'USAGE') AS executor_inherits_owner,
 CASE WHEN p.proname='can_generate_faqs' AND p.proargtypes='2950 23'::oidvector
   AND (p.proargnames IS DISTINCT FROM ARRAY['user_uuid','faq_count']::text[]) THEN 'BLOCK_PARAMETER_NAME_CONFLICT'
 WHEN p.proname IN ('begin_faq_generation','save_generated_faqs','begin_paddle_checkout','apply_paddle_event')
 THEN 'BLOCK_NAME_COLLISION_REVIEW_OVERLOADS'
 ELSE 'REVIEW_SECURITY_DEFINER_OWNER_SEARCH_PATH_AND_BODY' END AS result
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE (n.nspname='auth' AND p.proname IN ('uid','role')) OR (n.nspname='public' AND p.proname IN
 ('is_admin','can_generate_faqs','reset_monthly_usage','begin_faq_generation','save_generated_faqs','begin_paddle_checkout','apply_paddle_event',
 'change_subscription_plan','cancel_subscription','reactivate_subscription','check_and_reset_user_usage','check_and_handle_expired_subscriptions','increment_faq_usage','increment_faq_usage_by_count'))
ORDER BY n.nspname,p.proname,p.oid;

SELECT '12_roles' AS section,r.rolname,r.rolsuper,r.rolbypassrls,r.rolinherit
FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role',current_user);
WITH required(name) AS (VALUES ('anon'),('authenticated'),('service_role'))
SELECT '12_role_presence' AS section,name,CASE WHEN EXISTS(SELECT 1 FROM pg_roles WHERE rolname=name) THEN 'PRESENT' ELSE 'BLOCK_MISSING' END AS result FROM required;
SELECT '12_executor_create' AS section,has_schema_privilege(current_user,'public','CREATE') AS can_create_public_objects;

-- No function execution: has_* functions only inspect privilege metadata. NULL role columns mean missing roles.
WITH tables AS (SELECT c.oid,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname IN
 ('profiles','user_roles','user_subscriptions','payment_transactions','faq_collections','faqs','usage_analytics','paddle_checkouts','paddle_customers','paddle_events','paddle_payments','faq_generation_requests')),
 roles AS (SELECT oid,rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role'))
SELECT '13_effective_table_grants' AS section,t.relname,r.rolname,
 has_table_privilege(r.oid,t.oid,'SELECT') AS table_select,
 has_table_privilege(r.oid,t.oid,'INSERT') AS table_insert,
 has_table_privilege(r.oid,t.oid,'UPDATE') AS table_update,
 has_table_privilege(r.oid,t.oid,'DELETE') AS table_delete,
 has_any_column_privilege(r.oid,t.oid,'INSERT') AS any_column_insert,
 has_any_column_privilege(r.oid,t.oid,'UPDATE') AS any_column_update,
 'REVIEW: table REVOKE does not remove column grants or grants inherited via PUBLIC/other roles' AS note
FROM tables t CROSS JOIN roles r ORDER BY t.relname,r.rolname;

SELECT '14_explicit_table_and_column_acl' AS section,c.relname,a.attname AS column_name,
 CASE WHEN acl.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END AS grantee,acl.privilege_type,acl.is_grantable,
 CASE WHEN acl.grantee=0 THEN 'REVIEW_PUBLIC_GRANT: existing-table migration does not revoke PUBLIC'
 WHEN a.attname IS NOT NULL THEN 'REVIEW_COLUMN_GRANT: table revokes leave this intact' ELSE 'EXPLICIT_TABLE_GRANT' END AS result
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL
CROSS JOIN LATERAL aclexplode(CASE WHEN a.attname IS NULL THEN c.relacl ELSE a.attacl END) acl
WHERE n.nspname='public' AND c.relname IN ('profiles','user_roles','user_subscriptions','payment_transactions','faq_collections','faqs','usage_analytics')
UNION ALL
SELECT '14_explicit_table_and_column_acl',c.relname,NULL,
 CASE WHEN acl.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END,acl.privilege_type,acl.is_grantable,'EXPLICIT_TABLE_GRANT'
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(c.relacl) acl
WHERE n.nspname='public' AND c.relname IN ('profiles','user_roles','user_subscriptions','payment_transactions','faq_collections','faqs','usage_analytics')
AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attacl IS NOT NULL);

SELECT '15_policies' AS section,c.relname,p.polname,p.polcmd,p.polpermissive,
 ARRAY(SELECT CASE WHEN x=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x) END FROM unnest(p.polroles) x) AS roles,
 p.polqual IS NOT NULL AS has_using,p.polwithcheck IS NOT NULL AS has_with_check,
 md5(coalesce(pg_get_expr(p.polqual,p.polrelid),'')) AS using_hash,
 md5(coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')) AS check_hash,
 coalesce(pg_get_expr(p.polqual,p.polrelid),'') LIKE '%auth.uid()%' AS using_mentions_auth_uid,
 CASE WHEN c.relname IN ('user_subscriptions','payment_transactions') THEN 'WILL_REPLACE_ALL_POLICIES'
 ELSE 'REVIEW_OWNERSHIP: existing collection/FAQ/role policies survive' END AS migration_effect,
 CASE WHEN p.polpermissive AND (p.polqual IS NULL OR regexp_replace(pg_get_expr(p.polqual,p.polrelid),'[()[:space:]]','','g')='true')
 THEN 'REVIEW_UNSCOPED_POLICY' END AS warning
FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('profiles','user_roles','user_subscriptions','payment_transactions','faq_collections','faqs','usage_analytics')
ORDER BY c.relname,p.polname;

-- Existence is necessary, never proof that the USING/WITH CHECK expressions enforce ownership.
WITH required(table_name,command) AS (VALUES ('faq_collections','r'),('faq_collections','w'),('faq_collections','d'),
 ('faqs','r'),('faqs','w'),('faqs','d'),('user_roles','r'))
SELECT '15_policy_coverage' AS section,r.*,
 CASE WHEN EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND p.polpermissive
 AND p.polcmd::text IN ('*',r.command) AND EXISTS(SELECT 1 FROM unnest(p.polroles) pr
 WHERE CASE WHEN pr=0 THEN true ELSE coalesce(pg_has_role(authrole.oid,pr,'USAGE'),false) END))
 THEN 'REVIEW_POLICY_SEMANTICS' ELSE 'BLOCK_NO_APPLICABLE_PERMISSIVE_POLICY' END AS result
FROM required r LEFT JOIN pg_namespace n ON n.nspname='public'
LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=r.table_name
LEFT JOIN pg_roles authrole ON authrole.rolname='authenticated';

SELECT '16_effective_function_execute' AS section,n.nspname,p.oid::regprocedure::text AS signature,r.rolname,
 has_function_privilege(r.oid,p.oid,'EXECUTE') AS execute,
 CASE WHEN p.proname IN ('is_admin','uid','role') THEN 'REQUIRED_BY_AUTHENTICATED_CALLERS'
 ELSE 'REVIEW_LEGACY_EXECUTE: migration revokes selected names, inspect overloads' END AS note
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
CROSS JOIN (SELECT oid,rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')) r
WHERE (n.nspname='auth' AND p.proname IN ('uid','role')) OR (n.nspname='public' AND p.proname IN
 ('is_admin','can_generate_faqs','reset_monthly_usage','change_subscription_plan','cancel_subscription','reactivate_subscription',
 'check_and_reset_user_usage','check_and_handle_expired_subscriptions','increment_faq_usage','increment_faq_usage_by_count'));
SELECT '16_schema_usage' AS section,n.nspname,r.rolname,has_schema_privilege(r.oid,n.oid,'USAGE') AS usage
FROM pg_namespace n CROSS JOIN (SELECT oid,rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')) r
WHERE n.nspname IN ('public','auth');

SELECT '17_default_acl' AS section,coalesce(n.nspname,'ALL_SCHEMAS') AS schema_name,d.defaclobjtype,
 CASE WHEN acl.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END AS grantee,acl.privilege_type,
 'REVIEW_FUTURE_OBJECT_DEFAULTS_AND_OWNER' AS note
FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
CROSS JOIN LATERAL aclexplode(d.defaclacl) acl WHERE d.defaclnamespace=0 OR n.nspname='public';

-- Flags only: trigger bodies are not executed or printed. Extra triggers can alter INSERT/UPDATE behavior.
SELECT '18_triggers' AS section,c.relname,t.tgname,t.tgenabled,t.tgisinternal,
 pn.nspname AS function_schema,p.proname AS function_name,
 'REVIEW_TRIGGER_SIDE_EFFECTS_PRIVATELY' AS note
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace
WHERE n.nspname='public' AND c.relname IN ('user_subscriptions','faq_collections','faqs','usage_analytics','payment_transactions');

-- Migration history is metadata. Read ONLY version, never name/statements/created_by.
-- NOTICE output is supported by psql; retain notices as well as SELECT resultsets in SQL Editor.
SELECT '19_history_access' AS section,
 CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL THEN 'REVIEW_NO_HISTORY_TABLE'
 WHEN NOT has_table_privilege(current_user,to_regclass('supabase_migrations.schema_migrations'),'SELECT') THEN 'UNKNOWN_NO_HISTORY_ACCESS'
 ELSE 'READ_VERSION_NOTICE_BELOW' END AS result;

DO $preflight$
DECLARE local_versions text[] := ARRAY['20250105000000','20250105000001','20250106000000','20250107000000','20250107000001','20250107120000','20250109000000','20250115000000','20250120000000','20250121000000','20250122000000','20250123000000','20250124000000','20250125000000','20250126000000','20250629083932','20250913090000','20251001000000','20251002000000','20251003000000','20251003000001','20251003000002','20261004000000','20261022000000']; summary jsonb;
BEGIN
 IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
   RAISE NOTICE '19_migration_history: REVIEW_NO_HISTORY_TABLE; manual SQL may have been applied';
 ELSIF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('supabase_migrations.schema_migrations') AND attname='version' AND NOT attisdropped) THEN
   RAISE NOTICE '19_migration_history: BLOCK_HISTORY_VERSION_COLUMN_MISSING';
 ELSE
   EXECUTE $history$
     SELECT jsonb_build_object(
       'recorded_count',count(*),
       'target_recorded',coalesce(bool_or(version::text='20261022000000'),false),
       'duplicate_versions',count(*)<>count(DISTINCT version::text),
       'unrecognized_version_format',coalesce(bool_or(version::text !~ '^[0-9]{14}$'),false),
       'local_versions_not_recorded',ARRAY(SELECT v FROM unnest($1::text[]) v WHERE NOT EXISTS
         (SELECT 1 FROM supabase_migrations.schema_migrations h WHERE h.version::text=v)),
       'recorded_versions_not_local',ARRAY(SELECT CASE WHEN h.version::text ~ '^[0-9]{14}$' THEN h.version::text ELSE '[nonstandard-version]' END
         FROM supabase_migrations.schema_migrations h WHERE NOT(h.version::text=ANY($1::text[])))
     ) FROM supabase_migrations.schema_migrations
   $history$ INTO summary USING local_versions;
   RAISE NOTICE '19_migration_history: %',summary;
 END IF;
EXCEPTION WHEN insufficient_privilege THEN
 RAISE NOTICE '19_migration_history: UNKNOWN_INSUFFICIENT_PRIVILEGE (not a pass)';
END $preflight$;

SELECT '20_review_gate' AS section,
 'NOT_A_GO_DECISION: resolve BLOCK/REVIEW results, privately inspect object definitions, verify a restore, then coordinate rollout. Metadata cannot prove data cast/check compatibility or backup completeness.' AS result;
-- Preparation is a separate operator-controlled install before the billing migration.
SELECT '19_rollout_preparation' AS section,
 CASE WHEN to_regclass('public.faqify_rollout_control') IS NOT NULL
       AND to_regclass('public.faqify_rollout_leases') IS NOT NULL
       AND to_regprocedure('public.faqify_install_write_guards()') IS NOT NULL
       AND to_regprocedure('public.faqify_set_rollout(text,integer)') IS NOT NULL
 THEN 'PRESENT_REVIEW_GUARDS_AND_OPERATOR_ACLS' ELSE 'BLOCK_INSTALL_ROLLOUT_PREPARATION' END AS result;
SELECT '19_rollout_write_guards' AS section, c.relname AS table_name,
 CASE WHEN EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=c.oid
   AND t.tgname='faqify_rollout_write_guard' AND t.tgenabled='O' AND NOT t.tgisinternal)
 THEN 'PRESENT_REVIEW_TRIGGER_DEFINITION' ELSE 'BLOCK_MISSING_WRITE_GUARD' END AS result
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','p')
 AND c.relname NOT IN ('faqify_rollout_control','faqify_rollout_leases','faqify_sandbox_cohort')
 AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e');

ROLLBACK;
