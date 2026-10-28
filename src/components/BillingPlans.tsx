import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useCredits } from '@/hooks/useCredits';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PADDLE_READY, openPaddleCheckout, closePendingPaddleCheckout, pendingPaddleCheckout, resumePaddleCheckout, type PendingCheckout } from '@/lib/paddle';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { PaddleBilling } from '@/components/dashboard/PaddleBilling';
import { purchaseIntent } from '@/lib/purchase-intent';

const packs = [
  { pack: 'Pro' as const, credits: 100, dollars: 9 },
  { pack: 'Business' as const, credits: 500, dollars: 29 },
];
export function BillingPlans({ dashboard = false, onNavigateToOverview }: { dashboard?: boolean; onNavigateToOverview?: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingCheckout | null>(null);
  const [selectedPack, setSelectedPack] = useState<'Pro' | 'Business' | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const requestInFlight = useRef(false);
  const { user } = useAuth();
  const userId = user?.id;
  const { balance, refetch: refetchCredits } = useCredits();
  const { toast } = useToast();
  const intendedPack = dashboard ? purchaseIntent(window.location.search) : null;
  useEffect(() => {
    if (!userId || !PADDLE_READY) return;
    let active = true;
    pendingPaddleCheckout().then(value => { if (active) setPending(value); }).catch(() => {});
    return () => { active = false; };
  }, [userId]);
  async function refreshPending() {
    const value = await pendingPaddleCheckout();
    setPending(value);
    if (!value) { setSelectedPack(null); await refetchCredits(); }
    return value;
  }
  async function buy(pack: 'Pro' | 'Business') {
    if (!user || requestInFlight.current) return;
    requestInFlight.current = true;
    setBusy(pack);
    try {
      const existing = await refreshPending();
      if (existing) { setSelectedPack(pack); return; }
      await openPaddleCheckout(pack, user.email ?? '');
      await refreshPending();
    } catch (error) {
      await refreshPending().catch(() => {});
      toast({ title: 'Checkout unavailable', description: error instanceof Error ? error.message : 'Please retry.', variant: 'destructive' });
    }
    finally { requestInFlight.current = false; setBusy(null); }
  }
  async function resumePending() {
    if (!user || !pending?.transactionId || requestInFlight.current) return;
    requestInFlight.current = true;
    setBusy('resume');
    try { await resumePaddleCheckout(pending.transactionId, user.email ?? ''); }
    catch (error) { await refreshPending().catch(() => {}); toast({ title: 'Checkout changed', description: error instanceof Error ? error.message : 'Refresh checkout status.', variant: 'destructive' }); }
    finally { requestInFlight.current = false; setBusy(null); }
  }
  async function cancelPending() {
    if (!pending?.transactionId || requestInFlight.current) return;
    requestInFlight.current = true;
    setConfirmCancel(false);
    setBusy('cancel');
    const nextPack = selectedPack && selectedPack !== pending.pack ? selectedPack : null;
    try {
      await closePendingPaddleCheckout(pending.transactionId);
      setPending(null);
      setSelectedPack(null);
      toast({ title: 'Unfinished checkout canceled' });
      if (nextPack && user) {
        setBusy(nextPack);
        await openPaddleCheckout(nextPack, user.email ?? '');
      }
      await refreshPending();
    } catch (error) {
      await refreshPending().catch(() => {});
      toast({ title: 'Checkout was not replaced', description: error instanceof Error ? error.message : 'Refresh checkout status.', variant: 'destructive' });
    } finally { requestInFlight.current = false; setBusy(null); }
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
          {user && dashboard ? <Button variant="outline" className="w-full" onClick={onNavigateToOverview}>Go to dashboard</Button>
            : <Button asChild variant="outline" className="w-full"><Link to={user ? '/dashboard#overview' : '/signup'}>{user ? 'Go to dashboard' : 'Start free'}</Link></Button>}</CardContent></Card>
      {packs.map(({ pack, credits, dollars }) => <Card key={pack} className={pack === intendedPack ? 'border-primary ring-1 ring-primary' : ''}>
        <CardHeader><CardTitle>{pack} credit pack</CardTitle><p className="text-3xl font-bold">${dollars}<span className="text-sm font-normal text-muted-foreground"> one time</span></p></CardHeader>
        <CardContent className="space-y-4"><p>{credits} FAQ credits. They add to your existing balance and do not expire.</p>
          <p className="text-sm text-muted-foreground">No renewal. Additional purchases can be made before your balance reaches zero.</p>
          {!user ? <Button asChild className="w-full"><Link to={`/signup?purchase=${pack}`}>Buy {credits} credits</Link></Button>
            : <Button className="w-full" disabled={!!busy || !PADDLE_READY} onClick={() => buy(pack)}>{busy === pack ? 'Opening checkout…' : `Buy ${credits} credits`}</Button>}
        </CardContent></Card>)}
    </div>
    <p className="text-center text-sm text-muted-foreground">Secure sandbox checkout by Paddle. FAQ storage and published embeds have separate operational limits: 100 collections and 10,000 saved pairs per account. Credits pay for new AI-generated pairs, not unlimited hosting.{!PADDLE_READY ? ' Payments are being set up.' : ''}</p>
    {user && PADDLE_READY && pending && <Card className="border-amber-500/40" role="status"><CardContent className="pt-6 space-y-3">
      <p className="font-medium">{pending.pack} checkout {pending.status === 'processing' ? 'is being confirmed' : pending.status === 'preparing' ? 'is being prepared' : 'is unfinished'}</p>
      <p className="text-sm text-muted-foreground">{pending.status === 'processing'
        ? 'Payment may have completed. Credits will appear after confirmation; do not start another checkout yet.'
        : selectedPack && selectedPack !== pending.pack
          ? `Resume the ${pending.pack} checkout, or cancel it before buying ${selectedPack}. No credits change until payment completes.`
          : 'Resume this checkout, or cancel it if you no longer want it. Closing the payment window does not cancel the transaction.'}</p>
      <div className="flex flex-wrap gap-2">
        {pending.canResume && <Button disabled={!!busy} onClick={resumePending}>{busy === 'resume' ? 'Opening…' : 'Resume checkout'}</Button>}
        {pending.canCancel && <Button variant="outline" disabled={!!busy} onClick={() => setConfirmCancel(true)}>{selectedPack && selectedPack !== pending.pack ? `Cancel pending checkout and buy ${selectedPack}` : 'Cancel pending checkout'}</Button>}
        <Button variant="ghost" disabled={!!busy} onClick={() => { setBusy('refresh'); void refreshPending().catch(error => toast({ title: 'Unable to refresh checkout', description: error instanceof Error ? error.message : 'Please retry.', variant: 'destructive' })).finally(() => setBusy(null)); }}>Refresh checkout status</Button>
      </div>
    </CardContent></Card>}
    <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}><AlertDialogContent><AlertDialogHeader>
      <AlertDialogTitle>Cancel unfinished {pending?.pack} checkout?</AlertDialogTitle>
      <AlertDialogDescription>We will ask Paddle to cancel this unpaid transaction and verify its status before starting another checkout. Completed payments and existing credits are preserved.</AlertDialogDescription>
    </AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep checkout</AlertDialogCancel><AlertDialogAction onClick={cancelPending}>Cancel pending checkout</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    {dashboard && <PaddleBilling />}
  </section>;
}
