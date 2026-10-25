import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useCredits } from '@/hooks/useCredits';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PADDLE_READY, openPaddleCheckout, closePendingPaddleCheckout } from '@/lib/paddle';
import { PaddleBilling } from '@/components/dashboard/PaddleBilling';
import { purchaseIntent } from '@/lib/purchase-intent';

const packs = [
  { pack: 'Pro' as const, credits: 100, dollars: 9 },
  { pack: 'Business' as const, credits: 500, dollars: 29 },
];
export function BillingPlans({ dashboard = false }: { dashboard?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const requestInFlight = useRef(false);
  const { user } = useAuth();
  const { balance, refetch: refetchCredits } = useCredits();
  const { toast } = useToast();
  const intendedPack = dashboard ? purchaseIntent(window.location.search) : null;
  async function buy(pack: 'Pro' | 'Business') {
    if (!user || requestInFlight.current) return;
    requestInFlight.current = true;
    setBusy(pack);
    try { await openPaddleCheckout(pack, user.email ?? ''); await refetchCredits(); }
    catch (error) { toast({ title: 'Checkout unavailable', description: error instanceof Error ? error.message : 'Please retry.', variant: 'destructive' }); }
    finally { requestInFlight.current = false; setBusy(null); }
  }
  async function closePending() {
    if (!window.confirm('Close your unfinished checkout? Completed payments and credits will not change.')) return;
    setBusy('pending');
    try { await closePendingPaddleCheckout(); toast({ title: 'Pending checkout closed' }); }
    catch (error) { toast({ title: 'Unable to close checkout', description: error instanceof Error ? error.message : 'Please retry.', variant: 'destructive' }); }
    finally { setBusy(null); }
  }
  return <section id={dashboard ? undefined : 'pricing'} className={dashboard ? 'space-y-6' : 'py-20 px-4 space-y-8 max-w-7xl mx-auto'}>
    <div className="text-center space-y-3"><h2 className="text-3xl font-bold">FAQ credits, whenever you need them</h2>
      {intendedPack && <p role="status">You selected the {intendedPack} pack. Review the one-time terms below, then continue to secure checkout.</p>}
      <p className="text-muted-foreground">One credit saves one AI-generated question-and-answer pair. Buy either pack again at any time.</p>
      <p className="text-sm text-muted-foreground">One-time payment · No subscription or automatic renewal · Purchased credits do not expire · Applicable taxes are added at checkout.</p>
      {dashboard && balance && <p className="font-medium">{balance.available} credits available
        <span className="block text-sm text-muted-foreground">{balance.free} introductory · {balance.paid} purchased
          {balance.legacy > 0 ? ` · ${balance.legacy} remaining in your legacy period` : ''}
          {balance.reserved > 0 ? ` · ${balance.reserved} reserved for unfinished generations` : ''}</span></p>}
    </div>
    <div className="grid md:grid-cols-3 gap-6">
      <Card><CardHeader><CardTitle>Free introduction</CardTitle><p className="text-3xl font-bold">$0</p></CardHeader>
        <CardContent className="space-y-4"><p>5 FAQ credits once per account.</p><p className="text-sm text-muted-foreground">One collection before your first paid purchase. Existing content and embeds remain accessible after credits run out.</p>
          <Button asChild variant="outline" className="w-full"><Link to={user ? '/dashboard' : '/signup'}>{user ? 'Go to dashboard' : 'Start free'}</Link></Button></CardContent></Card>
      {packs.map(({ pack, credits, dollars }) => <Card key={pack} className={pack === intendedPack ? 'border-primary ring-1 ring-primary' : ''}>
        <CardHeader><CardTitle>{pack} credit pack</CardTitle><p className="text-3xl font-bold">${dollars}<span className="text-sm font-normal text-muted-foreground"> one time</span></p></CardHeader>
        <CardContent className="space-y-4"><p>{credits} FAQ credits. They add to your existing balance and do not expire.</p>
          <p className="text-sm text-muted-foreground">No renewal. Additional purchases can be made before your balance reaches zero.</p>
          {!user ? <Button asChild className="w-full"><Link to={`/signup?purchase=${pack}`}>Buy {credits} credits</Link></Button>
            : <Button className="w-full" disabled={!!busy || !PADDLE_READY} onClick={() => buy(pack)}>{busy === pack ? 'Opening checkout…' : `Buy ${credits} credits`}</Button>}
        </CardContent></Card>)}
    </div>
    <p className="text-center text-sm text-muted-foreground">Secure sandbox checkout by Paddle. FAQ storage and published embeds have separate operational limits: 100 collections and 10,000 saved pairs per account. Credits pay for new AI-generated pairs, not unlimited hosting.{!PADDLE_READY ? ' Payments are being set up.' : ''}</p>
    {user && PADDLE_READY && <div className="text-center"><Button variant="ghost" disabled={!!busy} onClick={closePending}>Close an unfinished checkout</Button></div>}
    {dashboard && <PaddleBilling />}
  </section>;
}
