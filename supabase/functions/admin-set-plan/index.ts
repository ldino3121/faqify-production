import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Authenticate caller
    const authHeader = req.headers.get('Authorization') ?? '';
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user) return json({ error: 'Unauthorized' }, 401);

    // Authorize: must be admin
    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();
    if (roleRow?.role !== 'admin') return json({ error: 'Forbidden' }, 403);

    const { userId, planTier } = await req.json();
    if (!userId || !['Free', 'Pro', 'Business'].includes(planTier)) {
      return json({ error: 'userId and a valid planTier are required' }, 400);
    }

    const { data: plan } = await supabase
      .from('subscription_plans')
      .select('faq_limit')
      .eq('name', planTier)
      .single();

    const { error } = await supabase
      .from('user_subscriptions')
      .update({
        plan_tier: planTier,
        faq_usage_limit: plan?.faq_limit ?? 5,
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (error) return json({ error: error.message }, 500);

    // Audit trail
    await supabase.from('subscription_history').insert({
      user_id: userId,
      from_plan_tier: null,
      to_plan_tier: planTier,
      change_type: 'admin_change',
      change_reason: `Admin (${user.id}) set plan to ${planTier}`,
      effective_date: new Date().toISOString(),
    });

    return json({ success: true, planTier });
  } catch (error) {
    return json({ error: error.message || 'Failed to set plan' }, 500);
  }
});
