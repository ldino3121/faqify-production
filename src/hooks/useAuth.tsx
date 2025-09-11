import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
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
  const [initialLoad, setInitialLoad] = useState(true);
  const [hasShownWelcome, setHasShownWelcome] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        // Get initial session first
        const { data: { session }, error } = await supabase.auth.getSession();

        if (mounted) {
          console.log('Initial session:', session?.user?.email);
          setSession(session);
          setUser(session?.user ?? null);
          setInitialLoad(false);
          setLoading(false);

          if (session) {
            setHasShownWelcome(true);
          }
        }
      } catch (error) {
        console.error('Error getting initial session:', error);
        if (mounted) {
          setLoading(false);
          setInitialLoad(false);
        }
      }
    };

    // Initialize auth state
    initAuth();

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.email);

      if (mounted && !initialLoad) {
        setSession(session);
        setUser(session?.user ?? null);

        if (event === 'SIGNED_IN' && !hasShownWelcome) {
          toast({
            title: "Welcome!",
            description: "You have been signed in successfully.",
          });
          setHasShownWelcome(true);
        } else if (event === 'SIGNED_OUT') {
          toast({
            title: "Signed out",
            description: "You have been signed out successfully.",
          });
          setHasShownWelcome(false);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [toast]);

  const signUp = async (email: string, password: string, fullName?: string) => {
    console.log('Attempting sign up for:', email);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: {
          full_name: fullName,
        },
      },
    });

    console.log('Sign up response:', { data, error });
    console.log('User created:', data.user?.id, data.user?.email);
    console.log('Session created:', !!data.session);

    if (error) {
      console.error('Sign up error:', error);
      console.error('Error code:', error.status);
      console.error('Error message:', error.message);

      // Handle various existing user scenarios - email is the unique identifier
      if (error.message.includes('already registered') ||
          error.message.includes('already exists') ||
          error.message.includes('User already registered') ||
          error.message.includes('email address is already in use') ||
          error.message.includes('duplicate key value') ||
          error.status === 422) {

        if (email.toLowerCase().includes('@gmail.com')) {
          throw new Error('Email already exists! This Gmail account may be registered with Google OAuth. Please try "Continue with Google" to sign in.');
        }
        throw new Error('Email already exists! This email is already registered. Please try signing in instead, or use Google login if you registered with Google.');
      }

      throw new Error(error.message);
    }

    // Handle signup success - email verification is disabled in config
    if (data.user) {
      if (data.session) {
        console.log('User signed up successfully with immediate session');
        toast({
          title: "Account created!",
          description: "Welcome to FAQify! Redirecting to your dashboard...",
        });

        // Redirect to dashboard after successful signup
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 1500);

      } else {
        console.log('User created but no session - this should not happen with confirmations disabled');
        toast({
          title: "Account created!",
          description: "Please try signing in with your credentials.",
        });
      }
    }
  };

  const signIn = async (email: string, password: string) => {
    console.log('Attempting sign in for:', email);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    console.log('Sign in response:', { data, error });
    console.log('Sign in user:', data.user?.email);
    console.log('Sign in session:', !!data.session);

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
    } catch {}
    if (error) {
      throw new Error(error.message);
    }
  };

  const signInWithGoogle = async () => {
    console.log('Attempting Google OAuth sign in...');
    console.log('Current origin:', window.location.origin);

    // Always use current origin for development
    const redirectUrl = `${window.location.origin}/dashboard`;

    console.log('Redirect URL:', redirectUrl);

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

    console.log('Google OAuth response:', { data, error });

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
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
