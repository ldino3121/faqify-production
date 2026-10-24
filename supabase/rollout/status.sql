-- Operator read-only checks. Aggregate counts only; never emits FAQ/user content.
BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
SELECT mode,minimum_client_revision FROM public.faqify_rollout_control;
SELECT count(*) AS active_function_leases, min(started_at) AS oldest_lease_started_at
FROM public.faqify_rollout_leases;
-- Compare before drain / after drain / after freeze. Existing empty collections
-- are not automatically corrupt. Never delete or merge them to make this zero.
SELECT count(*) AS collections_without_faqs
FROM public.faq_collections c WHERE NOT EXISTS(SELECT 1 FROM public.faqs f WHERE f.collection_id=c.id);
SELECT count(*) AS collection_count FROM public.faq_collections;
SELECT count(*) AS faq_count FROM public.faqs;
ROLLBACK;
