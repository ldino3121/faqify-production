import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useCredits } from '@/hooks/useCredits';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PADDLE_READY, openPaddleCheckout, closePendingPaddleCheckout, pendingPaddleCheckout, resumePaddleCheckout, type PendingCheckout } from '@/lib/paddle';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { PaddleBilling } from '@/components/dashboard/PaddleBilling';
import { purchaseIntent } from '@/lib/purchase-intent';
import { useSubscription } from '@/hooks/useSubscription';
import { legacyAllowance, localDate } from '@/lib/billing';

const packs = [
  { pack: 'Pro' as const, credits: 100, dollars: 9 },
  { pack: 'Business' as const, credits: 500, dollars: 29 },
];
export function BillingPlans({ dashboard = false, onNavigateToOverview }: { dashboard?: boolean; onNavigateToOverview?: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingCheckout | null>(null);
  const [selectedPack, setSelectedPack] = useState<'Pro' | 'Business' | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const requestInFlight = useRef(false);
  const statusInFlight = useRef<Promise<Awaited<ReturnType<typeof pendingPaddleCheckout>>> | null>(null);
  const pendingRef = useRef<PendingCheckout | null>(null);
  const { user } = useAuth();
  const userId = user?.id;
  const { balance, refetch: refetchCredits } = useCredits();
  const { subscription } = useSubscription();
  const { toast } = useToast();
  const location = useLocation();
  const intendedPack = dashboard ? purchaseIntent(window.location.search) : null;
  const pendingStatus = pending?.status;
  const legacy = legacyAllowance(balance, subscription);
  const refreshPending = useCallback(() => {
    if (statusInFlight.current) return statusInFlight.current;
    const task = (async () => {
      setCheckingStatus(true);
      try {
        const result = await pendingPaddleCheckout();
        const previous = pendingRef.current;
        pendingRef.current = result.pending;
        setPending(current => current?.transactionId === result.pending?.transactionId &&
          current?.status === result.pending?.status && current?.canResume === result.pending?.canResume &&
          current?.canCancel === result.pending?.canCancel ? current : result.pending);
        setStatusError(null);
        if (previous && result.result === 'fulfilled') toast({ title: 'Payment confirmed', description: 'Your credits and billing history are updated.' });
        else if (previous && result.result === 'canceled') toast({ title: 'Unfinished checkout canceled' });
        if (!result.pending) { setSelectedPack(null); await refetchCredits(); }
        return result;
      } catch (error) {
        setStatusError('Could not check Paddle right now. Your checkout and credits have not been changed.');
        throw error;
      } finally { setCheckingStatus(false); statusInFlight.current = null; }
    })();
    statusInFlight.current = task;
    return task;
  }, [refetchCredits, toast]);
  useEffect(() => {
    if (!userId || !PADDLE_READY) return;
    const check = () => { if (document.visibilityState === 'visible') void refreshPending().catch(() => {}); };
    check();
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('faqify-checkout-status-changed', check);
    return () => {
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('faqify-checkout-status-changed', check);
    };
  }, [userId, refreshPending]);
  useEffect(() => {
    if (!pendingStatus || !['processing', 'preparing'].includes(pendingStatus) || statusError) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const poll = async () => {
      try {
        const result = await refreshPending();
        if (active && result.pending && ['processing', 'preparing'].includes(result.pending.status) && ++attempts < 5)
          timer = setTimeout(poll, Math.min(1500 * 2 ** attempts, 12000));
      } catch { /* Retry appears only after a failed status check. */ }
    };
    timer = setTimeout(poll, 1500);
    return () => { active = false; clearTimeout(timer); };
  }, [pendingStatus, statusError, refreshPending]);
  async function buy(pack: 'Pro' | 'Business') {
    if (!user || requestInFlight.current) return;
    requestInFlight.current = true;
    setBusy(pack);
    try {
      const existing = (await refreshPending()).pending;
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
      pendingRef.current = null;
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
  if (dashboard && ['payments', 'activity'].includes(new URLSearchParams(location.search).get('history') ?? ''))
    return <section className="space-y-6"><PaddleBilling /></section>;
  return <section id={dashboard ? undefined : 'pricing'} className={dashboard ? 'space-y-6' : 'py-20 px-4 space-y-8 max-w-7xl mx-auto'}>
    <div className="text-center space-y-3"><h2 className="text-3xl font-bold">FAQ credits, whenever you need them</h2>
      {intendedPack && <p role="status">You selected the {intendedPack} pack. Review the one-time terms below, then continue to secure checkout.</p>}
      <p className="text-muted-foreground">One credit saves one generated question-and-answer pair.</p>
      <p className="text-sm text-muted-foreground">One-time payment · No automatic renewal · Purchased credits do not expire · Applicable taxes shown at checkout.</p>
    </div>
    {dashboard && <Card aria-label="Available credit balance"><CardContent className="py-4 min-h-32 sm:min-h-20 text-sm">
      <p className="font-semibold text-lg">{balance ? `${balance.available} credits available` : 'Loading available credits…'}</p>
      {balance && <p className="text-muted-foreground">{balance.paid} purchased
        {balance.free > 0 ? ` · ${balance.free} free` : ''}
        {legacy ? ` · ${legacy.remaining} temporary until ${localDate(legacy.expiresAt)}` : ''}
        {balance.reserved > 0 ? ` · ${balance.reserved} reserved` : ''}</p>}
    </CardContent></Card>}
    <div className="grid md:grid-cols-3 gap-6">
      <Card><CardHeader><CardTitle>Free introduction</CardTitle><p className="text-3xl font-bold">$0</p></CardHeader>
        <CardContent className="space-y-4"><p>5 FAQ credits once per account.</p>
          {user && dashboard ? <Button variant="outline" className="w-full" onClick={onNavigateToOverview}>Go to dashboard</Button>
            : <Button asChild variant="outline" className="w-full"><Link to={user ? '/dashboard#overview' : '/signup'}>{user ? 'Go to dashboard' : 'Start free'}</Link></Button>}</CardContent></Card>
      {packs.map(({ pack, credits, dollars }) => <Card key={pack} className={pack === intendedPack ? 'border-primary ring-1 ring-primary' : ''}>
        <CardHeader><CardTitle>{pack} credit pack</CardTitle><p className="text-3xl font-bold">${dollars}<span className="text-sm font-normal text-muted-foreground"> one time</span></p></CardHeader>
        <CardContent className="space-y-4"><p>{credits} FAQ credits added to your balance. Buy again whenever you need more.</p>
          {!user ? <Button asChild className="w-full"><Link to={`/signup?purchase=${pack}`}>Buy {credits} credits</Link></Button>
            : <Button className="w-full" disabled={!!busy || !PADDLE_READY} onClick={() => buy(pack)}>{busy === pack ? 'Opening checkout…' : `Buy ${credits} credits`}</Button>}
        </CardContent></Card>)}
    </div>
    <p className="text-center text-sm text-muted-foreground"><span className="font-medium">Test mode</span> · Secure checkout by Paddle.{!PADDLE_READY ? ' Payments are being set up.' : ''}</p>
    <details className="rounded border border-border p-4 text-sm"><summary className="cursor-pointer font-medium">Usage limits</summary>
      <p className="mt-2 text-muted-foreground">Free accounts can create one collection until their first paid purchase. Paid accounts can keep up to 100 collections and 10,000 saved FAQ pairs. Existing FAQs, exports and published embeds remain available when generation credits reach zero. Credits cover generation, not unlimited storage or hosting.</p>
    </details>
    {user && PADDLE_READY && pending && <Card className="border-amber-500/40" role="status"><CardContent className="pt-6 space-y-3">
      <p className="font-medium">{pending.pack} checkout {pending.status === 'processing' ? 'is being confirmed' : pending.status === 'preparing' ? 'is being prepared' : 'is unfinished'}</p>
      <p className="text-sm text-muted-foreground">{pending.status === 'processing'
        ? 'Payment may have completed. Credits will appear after confirmation; do not start another checkout yet.'
        : selectedPack && selectedPack !== pending.pack
          ? `Resume the ${pending.pack} checkout, or cancel it before buying ${selectedPack}. No credits change until payment completes.`
          : 'Resume this checkout, or cancel it if you no longer want it. Closing the payment window does not cancel the transaction.'}</p>
      <p className="h-5 text-sm text-muted-foreground" aria-live="polite">{checkingStatus ? 'Checking checkout status…' : statusError ? 'Status check failed. Retry below.' : ''}</p>
      <div className="flex flex-wrap gap-2">
        {pending.canResume && <Button disabled={!!busy} onClick={resumePending}>{busy === 'resume' ? 'Opening…' : 'Resume checkout'}</Button>}
        {pending.canCancel && <Button variant="outline" disabled={!!busy} onClick={() => setConfirmCancel(true)}>{selectedPack && selectedPack !== pending.pack ? `Cancel pending checkout and buy ${selectedPack}` : 'Cancel pending checkout'}</Button>}
      </div>
    </CardContent></Card>}
    {user && PADDLE_READY && statusError && <div role="alert" className="text-center text-sm text-amber-300 space-y-2">
      <p>{statusError}</p><Button variant="outline" disabled={checkingStatus || !!busy} onClick={() => { void refreshPending().catch(() => {}); }}>
        {checkingStatus ? 'Checking…' : 'Retry status check'}
      </Button>
    </div>}
    <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}><AlertDialogContent><AlertDialogHeader>
      <AlertDialogTitle>Cancel unfinished {pending?.pack} checkout?</AlertDialogTitle>
      <AlertDialogDescription>We will ask Paddle to cancel this unpaid transaction and verify its status before starting another checkout. Completed payments and existing credits are preserved.</AlertDialogDescription>
    </AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep checkout</AlertDialogCancel><AlertDialogAction onClick={cancelPending}>Cancel pending checkout</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    {dashboard && <PaddleBilling />}
  </section>;
}
