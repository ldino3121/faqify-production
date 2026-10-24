import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { openPaddlePortal } from '@/lib/paddle';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/hooks/useSubscription';
export function PaddleBilling() {
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const { subscription } = useSubscription();
  async function manage() {
    setBusy(true);
    try { await openPaddlePortal(); }
    catch (error) { toast({ title: 'Billing unavailable', description: error instanceof Error ? error.message : 'Please retry.', variant: 'destructive' }); }
    finally { setBusy(false); }
  }
  return <Card><CardHeader><CardTitle>Billing and invoices</CardTitle></CardHeader><CardContent className="space-y-4">
    <p className="text-sm text-muted-foreground">Payments are processed by Paddle, our Merchant of Record. Manage your subscription, payment method, and invoices in the secure billing portal.</p>
    {subscription?.cancelled_at && subscription?.plan_expires_at && <p className="text-sm">Renewal is stopped. Paid access ends {new Date(subscription.plan_expires_at).toLocaleDateString()}.</p>}
    <Button onClick={manage} disabled={busy}>{busy ? 'Opening…' : 'Manage billing'}</Button>
  </CardContent></Card>;
}
