// Funnel / activation analytics (P1-10).
// Analytics must never break UX, so every call is best-effort.
import { supabase } from '@/integrations/supabase/client';

export type AnalyticsEvent =
  | 'signup'
  | 'email_confirmed'
  | 'first_generation'
  | 'generation_success'
  | 'generation_failed'
  | 'collection_saved'
  | 'embed_copied'
  | 'export_clicked'
  | 'upgrade_clicked'
  | 'checkout_open'
  | 'payment_success'
  | 'payment_failed'
  | 'subscription_cancelled';

const SESSION_KEY = 'faqify_analytics_session';
const ATTRIBUTION_KEY = 'faqify_attribution';

function getSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return 'unknown';
  }
}

export interface Attribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  referrer?: string;
  landing_path?: string;
  captured_at?: string;
}

/** Capture first-touch attribution into sessionStorage (call once on app load). */
export function captureAttribution(): Attribution {
  try {
    const existing = sessionStorage.getItem(ATTRIBUTION_KEY);
    if (existing) return JSON.parse(existing);

    const params = new URLSearchParams(window.location.search);
    const attribution: Attribution = {
      utm_source: params.get('utm_source') || undefined,
      utm_medium: params.get('utm_medium') || undefined,
      utm_campaign: params.get('utm_campaign') || undefined,
      utm_content: params.get('utm_content') || undefined,
      referrer: document.referrer || undefined,
      landing_path: window.location.pathname,
      captured_at: new Date().toISOString(),
    };
    sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(attribution));
    return attribution;
  } catch {
    return {};
  }
}

export function getAttribution(): Attribution {
  try {
    return JSON.parse(sessionStorage.getItem(ATTRIBUTION_KEY) || '{}');
  } catch {
    return {};
  }
}

export interface TrackOptions {
  userId?: string;
  collectionId?: string;
  faqId?: string;
  metadata?: Record<string, unknown>;
}

/** Fire a funnel event to the track-analytics edge function. */
export async function trackEvent(event_type: AnalyticsEvent, opts: TrackOptions = {}): Promise<void> {
  try {
    await supabase.functions.invoke('track-analytics', {
      body: {
        event_type,
        user_id: opts.userId,
        collection_id: opts.collectionId,
        faq_id: opts.faqId,
        session_id: getSessionId(),
        metadata: { ...opts.metadata },
      },
    });
  } catch {
    // swallow — analytics is non-critical
  }
}
