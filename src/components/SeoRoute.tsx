import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { PUBLIC_APP_URL } from '@/config/env';

/**
 * Route-driven SEO. Mounted once inside <BrowserRouter>; sets the correct
 * title / description / canonical for every route automatically (P1-9).
 *
 * NOTE: Do NOT sell "FAQ schema" as an SEO benefit — Google removed FAQ rich
 * results in May 2026. These tags target CTR + correct indexing instead.
 */
interface RouteMeta {
  title: string;
  description: string;
}

const ROUTES: Record<string, RouteMeta> = {
  '/': {
    title: 'FAQify — AI-Powered FAQ Generator & Embeddable Widget',
    description:
      'Turn any URL, text, or document into an embeddable, searchable FAQ widget with AI. Reduce bounce and deflect support questions.',
  },
  '/demo': {
    title: 'Demo — FAQify',
    description: 'See how FAQify turns website content into an embedded FAQ widget in seconds.',
  },
  '/about': {
    title: 'About — FAQify',
    description: 'How FAQify helps teams convert visitors and deflect support tickets with AI FAQs.',
  },
  '/contact': {
    title: 'Contact — FAQify',
    description: 'Get in touch with the FAQify team.',
  },
  '/privacy': { title: 'Privacy Policy — FAQify', description: 'FAQify privacy policy.' },
  '/terms': { title: 'Terms of Service — FAQify', description: 'FAQify terms of service.' },
  '/cancellation-policy': {
    title: 'Cancellation Policy — FAQify',
    description: 'How to cancel your FAQify subscription.',
  },
  '/login': { title: 'Log in — FAQify', description: 'Log in to your FAQify account.' },
  '/signup': {
    title: 'Sign up — FAQify',
    description: 'Create a free FAQify account and generate your first AI FAQs.',
  },
  '/reset-password': { title: 'Reset password — FAQify', description: 'Reset your FAQify password.' },
  '/dashboard': { title: 'Dashboard — FAQify', description: 'Manage your FAQ collections and usage.' },
  '/admin': { title: 'Admin — FAQify', description: 'FAQify admin panel.' },
};

const NOT_FOUND: RouteMeta = { title: 'Page not found — FAQify', description: 'Page not found.' };

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export const SeoRoute = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    const meta = ROUTES[pathname] ?? NOT_FOUND;
    document.title = meta.title;
    upsertMeta('name', 'description', meta.description);
    upsertMeta('property', 'og:title', meta.title);
    upsertMeta('property', 'og:description', meta.description);
    upsertMeta('name', 'twitter:title', meta.title);
    upsertMeta('name', 'twitter:description', meta.description);

    if (PUBLIC_APP_URL) {
      const url = `${PUBLIC_APP_URL.replace(/\/+$/, '')}${pathname}`;
      let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'canonical';
        document.head.appendChild(link);
      }
      link.href = url;
      upsertMeta('property', 'og:url', url);
    }
  }, [pathname]);

  return null;
};

export default SeoRoute;
