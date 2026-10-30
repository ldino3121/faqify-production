import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useCredits } from '@/hooks/useCredits';
import { useSubscription } from '@/hooks/useSubscription';
import { supabase } from '@/integrations/supabase/client';
import { legacyAllowance, legacyAllowanceMessage } from '@/lib/billing';
import { useBillingRecords } from '@/hooks/useBillingRecords';
import { ActivityRecord, PaymentRecord } from './BillingRecordCards';

export const DashboardOverviewData = ({ onNavigateToUpgrade, onOpenBillingHistory }: {
  onNavigateToUpgrade?: () => void; onOpenBillingHistory?: (kind: 'payments' | 'activity') => void }) => {
  const { user } = useAuth();
  const { balance, loading: creditsLoading } = useCredits();
  const { subscription } = useSubscription();
  const billing = useBillingRecords();
  const content = useQuery({ queryKey: ['overview-content', user?.id], enabled: !!user,
    queryFn: async () => {
      const { data: collections, error } = await supabase.from('faq_collections')
        .select('id,title,created_at,faqs(count)').eq('user_id', user!.id).order('created_at', { ascending: false });
      if (error) throw error;
      return collections ?? [];
    }, staleTime: 15000 });
  const collections = content.data ?? [];
  const faqCount = collections.reduce((sum, item) => sum + (Array.isArray(item.faqs) ? (item.faqs[0]?.count ?? 0) : 0), 0);
  const legacy = legacyAllowance(balance, subscription);
  return <div className="space-y-6">
    <div><h1 className="text-3xl font-bold">Dashboard</h1><p className="text-muted-foreground">Your FAQ content and available generation credits</p></div>
    <div className="grid gap-4 md:grid-cols-3">
      <Card><CardHeader><CardTitle>Available FAQ credits</CardTitle></CardHeader><CardContent>
        <p className="text-3xl font-bold">{creditsLoading ? '…' : balance?.available ?? 0}</p>
        <p className="text-sm text-muted-foreground">{balance?.free ?? 0} introductory · {balance?.paid ?? 0} purchased
          {legacy ? ` · ${legacy.remaining} temporary allowance` : ''}</p>
        {legacy && subscription && <p className="text-xs text-muted-foreground">{legacyAllowanceMessage(subscription, legacy.expiresAt)}</p>}
        {(balance?.reserved ?? 0) > 0 && <p className="text-xs text-muted-foreground">{balance!.reserved} reserved for unfinished generation</p>}
        {balance?.introState === 'review' && <p className="text-xs text-muted-foreground">Existing-account introductory allowance is under review.</p>}
        <Button className="mt-4" onClick={onNavigateToUpgrade}>Buy credits and view billing</Button>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Collections</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{collections.length}</p>
        <p className="text-sm text-muted-foreground">One collection before the first paid purchase; up to 100 thereafter.</p></CardContent></Card>
      <Card><CardHeader><CardTitle>Saved FAQ pairs</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{faqCount}</p>
        <p className="text-sm text-muted-foreground">Existing FAQs, edits, exports and published embeds remain available at zero credits.</p></CardContent></Card>
    </div>
    {balance?.hold && <Card><CardContent className="pt-6" role="alert">A billing adjustment needs review before new AI generation. Your existing FAQs and embeds remain available. Contact support.</CardContent></Card>}
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Most recent completed payment</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
        {billing.payments.isPending && <p>Loading payment…</p>}
        {billing.payments.isError && <p role="alert">Payment summary unavailable.</p>}
        {billing.payments.isSuccess && (billing.completed[0]
          ? <ul><PaymentRecord payment={billing.completed[0]} /></ul> : <p>No completed purchases yet.</p>)}
        <Button variant="outline" onClick={() => onOpenBillingHistory?.('payments')}>View all payments</Button>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>Most recent credit activity</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
        {billing.activity.isPending && <p>Loading activity…</p>}
        {billing.activity.isError && <p role="alert">Credit activity unavailable.</p>}
        {billing.activity.isSuccess && (billing.activity.data[0]
          ? <ul><ActivityRecord entry={billing.activity.data[0]} /></ul> : <p>No credit activity yet.</p>)}
        <Button variant="outline" onClick={() => onOpenBillingHistory?.('activity')}>View all credit activity</Button>
      </CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle>Recent collections</CardTitle></CardHeader><CardContent className="space-y-2">
      {collections.slice(0,5).map(item => <p key={item.id}>{item.title} · {Array.isArray(item.faqs) ? (item.faqs[0]?.count ?? 0) : 0} FAQ pairs</p>)}
      {collections.length === 0 && <p className="text-muted-foreground">Your first collection will appear here.</p>}
    </CardContent></Card>
  </div>;
};
