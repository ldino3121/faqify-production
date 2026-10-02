// Cloudflare Turnstile captcha widget (opt-in).
//
// Renders nothing unless VITE_TURNSTILE_SITE_KEY is configured, so shipping this
// component is safe before the keys exist. The matching secret key is stored in
// Supabase Auth → Attack Protection (never in the frontend). Supabase supports
// Cloudflare Turnstile out of the box and expects the token via
// `options.captchaToken` on signUp / signInWithPassword / resetPasswordForEmail.
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { CAPTCHA_ENABLED, CAPTCHA_SITE_KEY } from '@/config/env';

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId?: string) => void;
      reset: (widgetId?: string) => void;
    };
  }
}

const SCRIPT_ID = 'cf-turnstile-script';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function loadTurnstile(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolve) => {
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener('load', () => resolve(), { once: true });
  });
}

export interface TurnstileCaptchaHandle {
  /** Reset the widget (a Turnstile token is single-use). */
  reset: () => void;
}

interface TurnstileCaptchaProps {
  /** Called with a fresh token when the challenge is solved. */
  onVerify: (token: string) => void;
  /** Called when a previously solved token expires. */
  onExpire?: () => void;
}

export const TurnstileCaptcha = forwardRef<TurnstileCaptchaHandle, TurnstileCaptchaProps>(
  function TurnstileCaptcha({ onVerify, onExpire }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);

    // Keep the latest callbacks without re-rendering / re-mounting the widget.
    const onVerifyRef = useRef(onVerify);
    const onExpireRef = useRef(onExpire);
    onVerifyRef.current = onVerify;
    onExpireRef.current = onExpire;

    useImperativeHandle(ref, () => ({
      reset: () => {
        if (widgetIdRef.current && window.turnstile) {
          try {
            window.turnstile.reset(widgetIdRef.current);
          } catch {
            /* widget already gone */
          }
        }
      },
    }), []);

    useEffect(() => {
      if (!CAPTCHA_ENABLED || !containerRef.current) return;
      let cancelled = false;
      const container = containerRef.current;

      loadTurnstile().then(() => {
        if (cancelled || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(container, {
          sitekey: CAPTCHA_SITE_KEY,
          theme: 'dark',
          callback: (token: string) => onVerifyRef.current(token),
          'expired-callback': () => onExpireRef.current?.(),
          'error-callback': () => onVerifyRef.current(''),
        });
      });

      return () => {
        cancelled = true;
        if (widgetIdRef.current && window.turnstile) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch {
            /* widget already gone */
          }
        }
        widgetIdRef.current = null;
      };
    }, []);

    if (!CAPTCHA_ENABLED) return null;
    return <div ref={containerRef} className="flex justify-center" aria-label="Bot protection" />;
  },
);

export default TurnstileCaptcha;