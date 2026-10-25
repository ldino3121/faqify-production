import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { openPaddlePortal } from '@/lib/paddle';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/hooks/useSubscription';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
export function PaddleBilling() {
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const { subscription } = useSubscription();
  const { user } = useAuth();
  const legacySubscription = !!subscription?.paddle_subscription_id;
  const history = useQuery({ queryKey: ['credit-history', user?.id], enabled: !!user,
    queryFn: async () => {
      const [grants, ledger, adjustments] = await Promise.all([
        supabase.from('faq_credit_grants').select('id,credits,remaining,granted_at,reversed_at,amount_cents,currency').eq('user_id', user!.id).order('granted_at', { ascending: false }).limit(30),
        supabase.from('faq_credit_ledger').select('id,bucket,entry_type,delta,created_at').eq('user_id', user!.id).order('created_at', { ascending: false }).limit(30),
        supabase.from('faq_credit_adjustments').select('adjustment_id,action,status,resolution').eq('user_id', user!.id).limit(30),
      ]);
      if (grants.error || ledger.error || adjustments.error) throw grants.error ?? ledger.error ?? adjustments.error;
      return { grants: grants.data ?? [], ledger: ledger.data ?? [], adjustments: adjustments.data ?? [] };
    }, staleTime: 15000 });
  async function manage() {
    setBusy(true);
    try { await openPaddlePortal(); }
    catch (error) { toast({ title: 'Billing unavailable', description: error instanceof Error ? error.message : 'Please retry.', variant: 'destructive' }); }
    finally { setBusy(false); }
  }
  return <Card><CardHeader><CardTitle>Billing and invoices</CardTitle></CardHeader><CardContent className="space-y-4">
    <p className="text-sm text-muted-foreground">Payments are processed by Paddle. Open the secure portal for invoices{legacySubscription ? ', and to manage your existing monthly subscription' : ''}.</p>
    {subscription?.cancelled_at && subscription?.plan_expires_at && <p className="text-sm">Renewal is stopped. Paid access ends {new Date(subscription.plan_expires_at).toLocaleDateString()}.</p>}
    <Button onClick={manage} disabled={busy}>{busy ? 'Opening…' : legacySubscription ? 'Manage legacy subscription and invoices' : 'View billing portal and invoices'}</Button>
    {history.data && <div className="space-y-3 text-sm"><h3 className="font-medium">Credit history</h3>
      {history.data.grants.map(grant => <p key={grant.id}>{new Date(grant.granted_at).toLocaleDateString()}: {grant.credits} purchased credits · {grant.credits - grant.remaining} used · {grant.remaining} remaining{grant.reversed_at ? ' · refunded/reversed' : ''}</p>)}
      {history.data.ledger.filter(entry => entry.entry_type === 'usage' || entry.entry_type === 'intro_grant').slice(0,10).map(entry =>
        <p key={entry.id}>{new Date(entry.created_at).toLocaleDateString()}: {entry.delta > 0 ? '+' : ''}{entry.delta} {entry.bucket} credits · {entry.entry_type === 'usage' ? 'saved AI FAQs' : 'free introduction'}</p>)}
      {history.data.adjustments.some(item => item.resolution === 'review') && <p role="status">A billing adjustment needs review. Existing FAQs and embeds remain available.</p>}
      {history.data.grants.length === 0 && <p>No credit-pack purchases yet.</p>}
    </div>}
  </CardContent></Card>;
}
