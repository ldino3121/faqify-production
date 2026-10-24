import { lazy, Suspense } from 'react';
import { BILLING_PROVIDER } from '@/lib/paddle';
import { BillingPlans } from '@/components/BillingPlans';
const Legacy = lazy(() => import('./LegacyPlanUpgrade'));
export const PlanUpgrade = () => BILLING_PROVIDER === 'paddle' ? <BillingPlans dashboard={true} /> : <Suspense fallback={<p>Loading plans…</p>}><Legacy /></Suspense>;
