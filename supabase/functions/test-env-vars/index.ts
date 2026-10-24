import { requireAdmin } from '../_shared/require-admin.ts';
import { json } from '../_shared/paddle.ts';
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return json({});
  const denial = await requireAdmin(req);
  if (denial) return denial;
  const names = ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','RAZORPAY_KEY_ID','RAZORPAY_SECRET_KEY','GEMINI_API_KEY'];
  return json({ presence: Object.fromEntries(names.map(name => [name, !!Deno.env.get(name)])) });
});
