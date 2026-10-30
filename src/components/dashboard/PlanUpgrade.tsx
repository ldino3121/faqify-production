import { BillingPlans } from '@/components/BillingPlans';
export const PlanUpgrade = ({ onNavigateToOverview, usageLimitsOpen, onUsageLimitsChange }: {
  onNavigateToOverview: () => void; usageLimitsOpen: boolean; onUsageLimitsChange: (open: boolean) => void;
}) => <BillingPlans dashboard={true} onNavigateToOverview={onNavigateToOverview}
  usageLimitsOpen={usageLimitsOpen} onUsageLimitsChange={onUsageLimitsChange} />;
