type PortalSession = {
  urls?: {
    general?: { overview?: unknown };
    subscriptions?: Array<{ id?: unknown; view_subscription?: unknown }>;
  };
};

function requirePaddleLink(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Paddle portal link unavailable');
  try {
    if (new URL(value).protocol === 'https:') return value;
  } catch { /* An incomplete provider response must not reach the browser. */ }
  throw new Error('Paddle portal link unavailable');
}

export function selectPortalLink(session: PortalSession, action: 'portal' | 'subscription', subscriptionId: string | null): string {
  if (action === 'subscription') {
    if (!subscriptionId) throw new Error('Previous subscription unavailable');
    const link = session.urls?.subscriptions?.find(item => item.id === subscriptionId);
    return requirePaddleLink(link?.view_subscription);
  }
  return requirePaddleLink(session.urls?.general?.overview);
}
