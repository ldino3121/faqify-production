import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const usePricingMigration = () => {
  const [migrationStatus, setMigrationStatus] = useState<'checking' | 'needed' | 'applied' | 'error'>('checking');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkAndApplyMigration();
  }, []);

  const checkAndApplyMigration = async () => {
    try {
      // Check if migration is needed by looking at current plan limits
      const { data: plans, error: plansError } = await supabase
        .from('subscription_plans')
        .select('name, faq_limit')
        .order('faq_limit');

      if (plansError) {
        console.error('Error checking plans:', plansError);
        setError(plansError.message);
        setMigrationStatus('error');
        return;
      }

      // Check if we have the correct pricing structure
      const freePlan = plans?.find(p => p.name === 'Free');
      const proPlan = plans?.find(p => p.name === 'Pro');
      const businessPlan = plans?.find(p => p.name === 'Business');

      const needsMigration =
        !freePlan || freePlan.faq_limit !== 10 ||
        !proPlan || proPlan.faq_limit !== 100 ||
        !businessPlan || businessPlan.faq_limit !== 500;

      if (!needsMigration) {
        console.log('✅ Pricing structure is up to date');
        setMigrationStatus('applied');
        return;
      }

      console.log('🔄 Pricing migration needed, applying...');
      setMigrationStatus('needed');

      // Apply migration by calling the edge function
      const { data, error: migrationError } = await supabase.functions.invoke('apply-pricing-migration');

      if (migrationError) {
        console.error('Migration failed:', migrationError);
        setError(migrationError.message);
        setMigrationStatus('error');
        return;
      }

      if (data?.success) {
        console.log('✅ Pricing migration applied successfully');
        setMigrationStatus('applied');
      } else {
        console.error('Migration failed:', data?.error);
        setError(data?.error || 'Unknown migration error');
        setMigrationStatus('error');
      }

    } catch (error) {
      console.error('Migration check failed:', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
      setMigrationStatus('error');
    }
  };

  return {
    migrationStatus,
    error,
    retryMigration: checkAndApplyMigration
  };
};
