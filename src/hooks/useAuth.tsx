import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName?: string, captchaToken?: string) => Promise<{ confirmationRequired: boolean }>;
  signIn: (email: string, password: string, captchaToken?: string) => Promise<void>;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  requestPasswordReset: (email: string, captchaToken?: string) => Promise<void>;
  completePasswordReset: (newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    let mounted = true;
    let authEventReceived = false;
    // Subscribe first: a later getSession result must never overwrite a newer auth event.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      authEventReceived = true;
      if (mounted) { setSession(next); setUser(next?.user ?? null); setLoading(false); }
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (mounted && !authEventReceived) {
        setSession(error ? null : data.session); setUser(error ? null : data.session?.user ?? null); setLoading(false);
      }
    }).catch(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  const signUp = async (email: string, password: string, fullName?: string, captchaToken?: string) => {

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: {
          full_name: fullName,
        },
        // Only sent when the captcha widget is active (Cloudflare Turnstile).
        ...(captchaToken ? { captchaToken } : {}),
      },
    });

    if (error) throw new Error(error.message);
    // With email confirmation enabled, a new user legitimately has no session.
    // Use the same response for existing addresses, avoiding account enumeration.
    return { confirmationRequired: !data.session };
  };

  const signIn = async (email: string, password: string, captchaToken?: string) => {

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
      ...(captchaToken ? { options: { captchaToken } } : {}),
    });


    if (error) {
      console.error('Sign in error:', error);

      // Provide helpful message for OAuth users
      if (error.message === 'Invalid login credentials') {
        // Check if this looks like a Gmail address (common OAuth scenario)
        if (email.toLowerCase().includes('@gmail.com')) {
          throw new Error('Invalid login credentials. This Gmail account may be registered with Google OAuth. Please try "Continue with Google" instead.');
        }

        // Generic helpful message
        throw new Error('Invalid login credentials. If you signed up with Google, please use the "Continue with Google" button above.');
      }

      throw new Error(error.message);
    }

    // Production-ready: Let auth state handle navigation automatically
  };

  const signOut = async () => {
    // Sign out locally and proactively clear client state to avoid stale session redirects
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    // Immediately clear in-memory auth state to prevent auto-redirects on /login
    setSession(null);
    setUser(null);
    try {
      // Best-effort cleanup of persisted auth tokens in localStorage (Supabase stores under sb-<ref>-auth-token)
      Object.keys(window.localStorage).forEach((key) => {
        if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
          window.localStorage.removeItem(key);
        }
      });
    } catch {
      // Best-effort only: localStorage can throw (Safari private mode, quota).
    }
    if (error) {
      throw new Error(error.message);
    }
  };

  // Request a password reset email; user will land on /reset-password
  const requestPasswordReset = async (email: string, captchaToken?: string) => {
    const redirectTo = `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
      ...(captchaToken ? { captchaToken } : {}),
    });
    if (error) {
      throw new Error(error.message);
    }
  };

  // Complete the password reset when user arrives via recovery link
  const completePasswordReset = async (newPassword: string) => {
    // During recovery, Supabase sets a temporary session; updateUser uses it
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Recovery link invalid or expired. Please request a new reset email.');
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      throw new Error(error.message);
    }
  };

  const signInWithGoogle = async () => {

    // Always use current origin for development
    const redirectUrl = `${window.location.origin}/dashboard`;


    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });


    if (error) {
      console.error('Google OAuth error:', error);
      throw new Error(error.message);
    }
  };



  const value = {
    user,
    session,
    loading,
    signUp,
    signIn,
    signOut,
    signInWithGoogle,
    requestPasswordReset,
    completePasswordReset,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
