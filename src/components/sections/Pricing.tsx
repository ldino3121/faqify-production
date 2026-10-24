import { lazy, Suspense } from 'react';
import { BILLING_PROVIDER } from '@/lib/paddle';
import { BillingPlans } from '@/components/BillingPlans';
const Legacy = lazy(() => import('./LegacyPricing'));
export const Pricing = () => BILLING_PROVIDER === 'paddle' ? <BillingPlans dashboard={false} /> : <Suspense fallback={<p>Loading plans…</p>}><Legacy /></Suspense>;
