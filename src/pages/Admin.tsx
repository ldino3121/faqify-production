import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { PLANS } from '@/config/plans';
import { ArrowLeft, Loader2, Users, CreditCard, BarChart3 } from 'lucide-react';

interface AdminUser {
  id: string;
  email: string | null;
  full_name: string | null;
  plan_tier: string | null;
  status: string | null;
  faq_usage_current: number | null;
  faq_usage_limit: number | null;
  free_credits: number | null;
  paid_credits: number | null;
  credit_hold: boolean;
}

interface AdminTx {
  id: string;
  user_id: string;
  payment_gateway: string | null;
  status: string | null;
  amount: number | null;
  currency: string | null;
  plan_tier: string | null;
  created_at: string;
}

interface CreditReview {
  adjustment_id: string; transaction_id: string; user_id: string;
  action: string; adjustment_type: string | null; status: string; occurred_at: string;
}

const Admin = () => {
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [txs, setTxs] = useState<AdminTx[]>([]);
  const [funnel, setFunnel] = useState<Record<string, number>>({});
  const [creditReviews, setCreditReviews] = useState<CreditReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: profiles } = await supabase.from('profiles').select('id, email, full_name');
    const { data: subs } = await supabase
      .from('user_subscriptions')
      .select('user_id, plan_tier, status, faq_usage_current, faq_usage_limit');
    const { data: wallets } = await supabase.from('faq_credit_wallets').select('user_id,free_available,paid_available,hold_reason');
    const subMap = new Map((subs || []).map((s: any) => [s.user_id, s]));
    const walletMap = new Map((wallets || []).map(w => [w.user_id, w]));
    setUsers(
      ((profiles as any[]) || []).map((p) => {
        const s: any = subMap.get(p.id) || {};
        const wallet = walletMap.get(p.id);
        return {
          id: p.id,
          email: p.email,
          full_name: p.full_name,
          plan_tier: s.plan_tier ?? null,
          status: s.status ?? null,
          faq_usage_current: s.faq_usage_current ?? null,
          faq_usage_limit: s.faq_usage_limit ?? null,
          free_credits: wallet?.free_available ?? null,
          paid_credits: wallet?.paid_available ?? null,
          credit_hold: !!wallet?.hold_reason,
        };
      }),
    );

    const { data: t } = await (supabase as any)
      .from('payment_transactions')
      .select('id, user_id, payment_gateway, status, amount, currency, plan_tier, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    const { data: paddlePayments } = await (supabase as any).from('paddle_payments')
      .select('*').order('paid_at', { ascending: false }).limit(100);
    const { data: creditGrants } = await supabase.from('faq_credit_grants')
      .select('transaction_id,user_id,amount_cents,currency,credits,granted_at,reversed_at')
      .order('granted_at', { ascending: false }).limit(100);
    const { data: reviews, error: reviewError } = await supabase.from('faq_credit_adjustments')
      .select('adjustment_id,transaction_id,user_id,action,adjustment_type,status,occurred_at')
      .eq('resolution', 'review').order('occurred_at', { ascending: false }).limit(100);
    if (reviewError) toast({ title: 'Credit reviews unavailable', description: 'Retry the admin page.', variant: 'destructive' });
    setCreditReviews(reviews ?? []);
    setTxs([...(t || []), ...(creditGrants || []).map(g => ({
      id: g.transaction_id, user_id: g.user_id, payment_gateway: 'paddle credit pack',
      status: g.reversed_at ? 'reversed' : 'completed', amount: g.amount_cents,
      currency: g.currency, plan_tier: `${g.credits} credits`, created_at: g.granted_at,
    })), ...(paddlePayments || []).map((p: any) => ({
      id: p.transaction_id, user_id: p.user_id, payment_gateway: 'paddle', status: p.status,
      amount: Number(p.amount), currency: p.currency, plan_tier: p.tier, created_at: p.paid_at,
    }))].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 100));

    const { data: ev } = await supabase.from('usage_analytics').select('action, action_type');
    const counts: Record<string, number> = {};
    ((ev as any[]) || []).forEach((e) => {
      const k = e.action_type || e.action || 'unknown';
      counts[k] = (counts[k] || 0) + 1;
    });
    setFunnel(counts);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const setPlan = async (userId: string, planTier: string) => {
    setSavingId(userId);
    try {
      const { data, error } = await supabase.functions.invoke('admin-set-plan', {
        body: { userId, planTier },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to update plan');
      toast({ title: 'Plan updated', description: `User set to ${planTier}.` });
      await load();
    } catch (e) {
      toast({
        title: 'Update failed',
        description: e instanceof Error ? e.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="sm">
            <Link to="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" />Dashboard</Link>
          </Button>
          <h1 className="text-2xl font-bold">Admin</h1>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <Tabs defaultValue="users">
            <TabsList>
              <TabsTrigger value="users"><Users className="mr-2 h-4 w-4" />Users</TabsTrigger>
              <TabsTrigger value="transactions"><CreditCard className="mr-2 h-4 w-4" />Transactions</TabsTrigger>
              <TabsTrigger value="credit-reviews">Credit reviews ({creditReviews.length})</TabsTrigger>
              <TabsTrigger value="funnel"><BarChart3 className="mr-2 h-4 w-4" />Funnel</TabsTrigger>
            </TabsList>

            <TabsContent value="users">
              <Card>
                <CardHeader><CardTitle>Users, credits &amp; legacy subscriptions ({users.length})</CardTitle></CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead><TableHead>Name</TableHead><TableHead>Plan</TableHead>
                        <TableHead>Status</TableHead><TableHead>Credits</TableHead><TableHead>Legacy period usage</TableHead><TableHead>Set legacy plan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell className="font-mono text-xs">{u.email}</TableCell>
                          <TableCell>{u.full_name || '—'}</TableCell>
                          <TableCell><Badge variant="secondary">{u.plan_tier || 'Free'}</Badge></TableCell>
                          <TableCell>{u.status || '—'}</TableCell>
                          <TableCell>{u.free_credits ?? '—'} free · {u.paid_credits ?? '—'} purchased{u.credit_hold ? ' · review' : ''}</TableCell>
                          <TableCell>{u.faq_usage_current ?? 0}/{u.faq_usage_limit ?? 0}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Select onValueChange={(v) => setPlan(u.id, v)}>
                                <SelectTrigger className="w-[120px]"><SelectValue placeholder="Change" /></SelectTrigger>
                                <SelectContent>
                                  {PLANS.map((p) => (
                                    <SelectItem key={p.tier} value={p.tier}>{p.tier}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {savingId === u.id && <Loader2 className="h-4 w-4 animate-spin" />}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="credit-reviews"><Card><CardHeader><CardTitle>Credit adjustments requiring reconciliation</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto text-sm">
                {creditReviews.length === 0 ? <p>No unresolved credit adjustments.</p> : <Table><TableHeader><TableRow>
                  <TableHead>Account</TableHead><TableHead>Payment</TableHead><TableHead>Adjustment</TableHead><TableHead>Action</TableHead><TableHead>Status</TableHead><TableHead>Occurred</TableHead>
                </TableRow></TableHeader><TableBody>{creditReviews.map(review => <TableRow key={review.adjustment_id}>
                  <TableCell className="font-mono text-xs">{review.user_id}</TableCell>
                  <TableCell className="font-mono text-xs">{review.transaction_id}</TableCell>
                  <TableCell className="font-mono text-xs">{review.adjustment_id}</TableCell>
                  <TableCell>{review.action} · {review.adjustment_type ?? 'unspecified'}</TableCell>
                  <TableCell>{review.status}</TableCell>
                  <TableCell>{new Date(review.occurred_at).toLocaleString()}</TableCell>
                </TableRow>)}</TableBody></Table>}
              </CardContent></Card></TabsContent>

            <TabsContent value="transactions">
              <Card>
                <CardHeader><CardTitle>Recent transactions ({txs.length})</CardTitle></CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead><TableHead>User</TableHead><TableHead>Gateway</TableHead>
                        <TableHead>Plan</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {txs.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="text-xs">{new Date(t.created_at).toLocaleString()}</TableCell>
                          <TableCell className="font-mono text-xs">{t.user_id.slice(0, 8)}…</TableCell>
                          <TableCell>{t.payment_gateway || '—'}</TableCell>
                          <TableCell>{t.plan_tier || '—'}</TableCell>
                          <TableCell>{t.amount != null ? `${(t.amount / 100).toFixed(2)} ${(t.currency || '').toUpperCase()}` : '—'}</TableCell>
                          <TableCell><Badge variant={t.status === 'completed' ? 'default' : 'secondary'}>{t.status}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="funnel">
              <Card>
                <CardHeader><CardTitle>Event counts</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-1 text-sm">
                    {Object.entries(funnel).length === 0 && (
                      <li className="text-muted-foreground">No events yet.</li>
                    )}
                    {Object.entries(funnel).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                      <li key={k} className="flex justify-between border-b border-border/40 py-1">
                        <span>{k}</span><span className="font-mono">{v}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
};

export default Admin;
