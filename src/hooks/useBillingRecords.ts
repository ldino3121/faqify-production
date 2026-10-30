import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { paymentCategory, type PaymentSummary } from '@/lib/billing';

export type LedgerEntry = { id: number; bucket: string; entry_type: string; delta: number;
  created_at: string; source_transaction_id: string | null; source_adjustment_id: string | null;
  grant_id: number | null; grantCredits?: number | null };
export type HistoryPage = { transactions: PaymentSummary[]; next: string | null; hasCustomer: boolean };

export async function fetchLedgerPage(accountId: string, offset: number, limit: number): Promise<LedgerEntry[]> {
  const { data, error } = await supabase.from('faq_credit_ledger')
    .select('id,bucket,entry_type,delta,created_at,source_transaction_id,source_adjustment_id,grant_id')
    .eq('user_id', accountId).order('created_at', { ascending: false }).order('id', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  const rows = data ?? [];
  const grantIds = rows.filter(row => row.entry_type === 'purchase_grant' && row.grant_id != null)
    .map(row => row.grant_id!);
  if (!grantIds.length) return rows;
  const { data: grants, error: grantError } = await supabase.from('faq_credit_grants')
    .select('id,credits').eq('user_id', accountId).in('id', grantIds);
  if (grantError) throw grantError;
  const credits = new Map((grants ?? []).map(grant => [grant.id, grant.credits]));
  return rows.map(row => ({ ...row, grantCredits: row.grant_id ? credits.get(row.grant_id) ?? null : null }));
}

export function useBillingRecords() {
  const { user } = useAuth();
  const accountId = user?.id;
  const payments = useQuery({ queryKey: ['paddle-recent-completed', accountId], enabled: !!accountId,
    queryFn: async (): Promise<HistoryPage> => {
      const { data, error } = await supabase.functions.invoke('paddle-customer-portal', { body: { action: 'recent_completed' } });
      if (error || !data || !Array.isArray(data.transactions)) throw error ?? new Error(data?.error || 'Payment summary unavailable');
      return data as HistoryPage;
    }, staleTime: 30000 });
  const activity = useQuery({ queryKey: ['credit-recent-activity', accountId], enabled: !!accountId,
    queryFn: () => fetchLedgerPage(accountId!, 0, 3), staleTime: 30000 });
  const completed = (payments.data?.transactions ?? []).filter(payment => paymentCategory(payment) === 'completed').slice(0, 3);
  return { payments, activity, completed, hasCustomer: payments.data?.hasCustomer ?? false };
}
