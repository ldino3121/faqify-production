import { formatPaymentAmount, localDate, paymentStatusText, type PaymentSummary } from '@/lib/billing';
import type { LedgerEntry } from '@/hooks/useBillingRecords';
import { activityLabel } from '@/lib/billing-activity';

export function PaymentRecord({ payment }: { payment: PaymentSummary }) {
  const description = payment.kind === 'credit_pack' ? `${payment.pack} pack · ${payment.credits} FAQ credits`
    : payment.kind === 'recurring' ? `Previous ${payment.pack} subscription payment`
      : `Previous ${payment.pack} 30-day access payment`;
  return <li className="rounded border border-border p-3 min-w-0 break-words">
    <p className="font-medium">{description}</p>
    <p className="text-sm">{localDate(payment.billedAt ?? payment.createdAt)} · {formatPaymentAmount(payment.amount, payment.currency)}</p>
    <p className="text-sm text-muted-foreground">{paymentStatusText(payment)}</p>
    <p className="text-xs text-muted-foreground">Payment reference: {payment.id}</p>
  </li>;
}

export function ActivityRecord({ entry }: { entry: LedgerEntry }) {
  return <li className="rounded border border-border p-3 min-w-0 break-words">
    <p className="font-medium">{activityLabel(entry)}</p>
    <p className="text-xs text-muted-foreground">{localDate(entry.created_at)}</p>
  </li>;
}
