// Single source of truth for pricing plans and FAQ limits across the app.
// IMPORTANT: keep in sync with supabase/migrations/20250120000000_canonical_pricing.sql

export type PlanTier = 'Free' | 'Pro' | 'Business';

export interface PlanDef {
  tier: PlanTier;
  name: string;
  /** Price in whole USD dollars (for display). */
  priceMonthlyUsd: number;
  /** Price in USD cents (for DB / Razorpay). */
  priceMonthlyCents: number;
  /** Monthly FAQ generation quota. */
  faqLimit: number;
  description: string;
  popular: boolean;
  features: string[];
}

const CORE_FEATURES = [
  'Website URL analysis',
  'Text content analysis',
  'Document upload (PDF, DOCX)',
  'AI-powered FAQ generation',
  'Embed widget',
  'WordPress integration',
  'Analytics dashboard',
  'Export functionality',
];

export const PLANS: PlanDef[] = [
  {
    tier: 'Free',
    name: 'Free',
    priceMonthlyUsd: 0,
    priceMonthlyCents: 0,
    faqLimit: 5,
    description: 'Perfect for trying out FAQify',
    popular: false,
    features: [...CORE_FEATURES, 'Email support'],
  },
  {
    tier: 'Pro',
    name: 'Pro',
    priceMonthlyUsd: 9,
    priceMonthlyCents: 900,
    faqLimit: 100,
    description: 'Ideal for small businesses and content creators',
    popular: true,
    features: [...CORE_FEATURES, 'Priority email support'],
  },
  {
    tier: 'Business',
    name: 'Business',
    priceMonthlyUsd: 29,
    priceMonthlyCents: 2900,
    faqLimit: 500,
    description: 'For agencies and large organizations',
    popular: false,
    features: [...CORE_FEATURES, 'Priority support & phone support'],
  },
];

export const planByTier = (tier: PlanTier): PlanDef => {
  const plan = PLANS.find((p) => p.tier === tier);
  if (!plan) throw new Error(`Unknown plan tier: ${tier}`);
  return plan;
};

export const FREE_FAQ_LIMIT = planByTier('Free').faqLimit;
