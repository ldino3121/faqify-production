import { withRolloutGuard } from '../_shared/rollout.ts';
import { adminClient, authenticated, json } from '../_shared/paddle.ts';
const allowed = new Set(['signup','email_confirmed','first_generation','generation_success','generation_failed','collection_saved','embed_copied','export_clicked','upgrade_clicked','checkout_open','payment_success','payment_failed','subscription_cancelled','embed_generated']);
const publicEvents = new Set(['widget_load','faq_view','faq_click']);
const hits = new Map<string, { start: number; count: number }>();
Deno.serve(withRolloutGuard(async req => {
  if (req.method === 'OPTIONS') return json({});
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';
    const now = Date.now();
    if (hits.size > 5000) for (const [key, value] of hits) if (now - value.start > 60000) hits.delete(key);
    const bucket = hits.get(ip);
    if (bucket && now - bucket.start < 60000 && bucket.count >= 120) return json({ ignored: true }, 429);
    hits.set(ip, { start: bucket && now - bucket.start < 60000 ? bucket.start : now, count: bucket && now - bucket.start < 60000 ? bucket.count + 1 : 1 });
    const body = await req.json();
    const db = adminClient();
    const user = await authenticated(req, db);
    let userId = user?.id;
    let metadata: Record<string, unknown> = {};
    if (publicEvents.has(body.event_type)) {
      const { data: collection } = await db.from('faq_collections').select('id,user_id').eq('id', body.collection_id).eq('status','published').maybeSingle();
      if (!collection) return json({ ignored: true });
      userId = collection.user_id;
      metadata = { collection_id: collection.id };
    } else if (userId && allowed.has(body.event_type)) {
      // Do not trust body.user_id or persist arbitrary user-supplied objects.
      metadata = { session_id: typeof body.session_id === 'string' ? body.session_id.slice(0,100) : null };
    } else return json({ ignored: true });
    const { error } = await db.rpc('track_simple_analytics', { user_uuid: userId, action_type: body.event_type, metadata_json: metadata });
    if (error) console.warn('Analytics storage unavailable', error.code);
    return json({ success: !error });
  } catch { return json({ success: false }); }
}, 'track-analytics', false));
