import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PLANS } from '@/config/plans';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PADDLE_ONETIME, PADDLE_READY, openPaddleCheckout, closePendingPaddleCheckout } from '@/lib/paddle';
import { PaddleBilling } from '@/components/dashboard/PaddleBilling';
export function BillingPlans({ dashboard = false }: { dashboard?: boolean }) {
  const [kind, setKind] = useState<'recurring' | 'one_time'>('recurring');
  const [busy, setBusy] = useState<string | null>(null);
  const { user } = useAuth();
  const { subscription, refetch } = useSubscription();
  const { toast } = useToast();
  const recurring = subscription && (subscription.paddle_subscription_id || subscription.razorpay_subscription_id)
    && ((subscription.plan_expires_at && new Date(subscription.plan_expires_at) > new Date()) || ['active', 'past_due', 'paused', 'pending'].includes(subscription.status));
  async function buy(tier: 'Pro' | 'Business') {
    if (!user || busy) return;
    setBusy(tier);
    try { await openPaddleCheckout(tier, kind, user.email ?? ''); await refetch(); }
    catch (error) { toast({ title: 'Checkout unavailable', description: error instanceof Error ? error.message : 'Please retry.', variant: 'destructive' }); }
    finally { setBusy(null); }
  }
  async function closePending() {
    if (!window.confirm('Close your unfinished checkout? You can then choose another plan. Completed payments will not be changed.')) return;
    setBusy('pending');
    try { await closePendingPaddleCheckout(); toast({ title: 'Pending checkout closed' }); }
    catch (error) { toast({ title: 'Unable to close checkout', description: error instanceof Error ? error.message : 'Please retry.', variant: 'destructive' }); }
    finally { setBusy(null); }
  }
  return <section id={dashboard ? undefined : 'pricing'} className={dashboard ? 'space-y-6' : 'py-20 px-4 space-y-8 max-w-7xl mx-auto'}>
    <div className="text-center space-y-3"><h2 className="text-3xl font-bold">{dashboard ? 'Choose your plan' : 'Simple, transparent pricing'}</h2>
      <p className="text-muted-foreground">Start free. Upgrade when you need more FAQs.</p>
      {PADDLE_ONETIME && <div className="flex justify-center gap-2"><Button variant={kind === 'recurring' ? 'default' : 'outline'} onClick={() => setKind('recurring')}>Monthly subscription</Button><Button variant={kind === 'one_time' ? 'default' : 'outline'} onClick={() => setKind('one_time')}>One-time · 30 days</Button></div>}
      <p className="text-sm text-muted-foreground">{kind === 'recurring' ? 'Paid plans renew monthly. Cancel future renewals through billing.' : 'Pay once for 30 days of access. No automatic renewal.'} Applicable taxes are shown at checkout.</p>
    </div>
    {recurring && <p className="text-center text-sm">You already have a recurring subscription. Manage it from the dashboard before purchasing another plan.</p>}
    <div className="grid md:grid-cols-3 gap-6">{PLANS.map(plan => <Card key={plan.tier} className={plan.popular ? 'border-primary' : ''}>
      <CardHeader><CardTitle>{plan.name}{plan.popular ? ' · Most popular' : ''}</CardTitle><p className="text-3xl font-bold">${plan.priceMonthlyUsd}<span className="text-sm font-normal text-muted-foreground">{plan.tier === 'Free' ? ' forever' : kind === 'recurring' ? '/month' : ' for 30 days'}</span></p></CardHeader>
      <CardContent className="space-y-5"><p>{plan.faqLimit} FAQ pairs {plan.tier === 'Free' || kind === 'recurring' ? 'per month' : 'during your access period'}</p>
        {plan.tier === 'Free' && <p className="text-sm text-muted-foreground">One collection · FAQify branding</p>}
        <ul className="text-sm space-y-2">{plan.features.filter(feature => feature !== 'Analytics dashboard').map(feature => <li key={feature}>✓ {feature}</li>)}</ul>
        {!user ? <Button asChild className="w-full"><Link to="/signup">{plan.tier === 'Free' ? 'Start free' : `Choose ${plan.name}`}</Link></Button>
          : plan.tier === 'Free' ? <Button asChild variant="outline" className="w-full"><Link to="/dashboard">Go to dashboard</Link></Button>
          : <Button className="w-full" disabled={!!busy || !!recurring || !PADDLE_READY} onClick={() => buy(plan.tier as 'Pro' | 'Business')}>{busy === plan.tier ? 'Opening checkout…' : recurring ? 'Subscription already active' : `Choose ${plan.name}`}</Button>}
      </CardContent></Card>)}</div>
    <p className="text-center text-sm text-muted-foreground">Secure checkout by Paddle, our Merchant of Record.{!PADDLE_READY ? ' Payments are being set up. Please contact support.' : ''}</p>
    {user && !recurring && PADDLE_READY && <div className="text-center"><Button variant="ghost" disabled={!!busy} onClick={closePending}>Close an unfinished checkout</Button></div>}
    {dashboard && subscription?.paddle_customer_id && <PaddleBilling />}
  </section>;
}
