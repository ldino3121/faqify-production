import { BillingPlans } from '@/components/BillingPlans';
export const PlanUpgrade = ({ onNavigateToOverview }: { onNavigateToOverview: () => void }) =>
  <BillingPlans dashboard={true} onNavigateToOverview={onNavigateToOverview} />;
