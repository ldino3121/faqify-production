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
  const [hasShownWelcome, setHasShownWelcome] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Set up auth state listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.email);
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

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
    });

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('Initial session:', session?.user?.email);
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      if (session) {
        setHasShownWelcome(true);
      }
    });

    return () => subscription.unsubscribe();
  }, [toast, hasShownWelcome]);

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

      // Provide helpful message for existing OAuth users
      if (error.message.includes('already registered') || error.message.includes('already exists')) {
        if (email.toLowerCase().includes('@gmail.com')) {
          throw new Error('This Gmail account may already be registered with Google OAuth. Please try "Continue with Google" to sign in.');
        }
        throw new Error('This email is already registered. Please try signing in instead, or use social login if you registered with Google/GitHub.');
      }

      throw new Error(error.message);
    }

    // For immediate sign-up without email verification
    if (data.user && data.session) {
      console.log('User signed up successfully with session');
      toast({
        title: "Account created!",
        description: "You can now access your dashboard.",
      });
    } else if (data.user && !data.session) {
      console.log('User created but no session - needs email verification');
      toast({
        title: "Account created!",
        description: "Please check your email to verify your account.",
      });
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
          throw new Error('This Gmail account may be registered with Google OAuth. Please try "Continue with Google" instead, or use a different email for password login.');
        }

        // Generic helpful message
        throw new Error('Invalid login credentials. If you signed up with Google or GitHub, please use the social login buttons above.');
      }

      throw new Error(error.message);
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw new Error(error.message);
    }
  };

  const signInWithGoogle = async () => {
    console.log('Attempting Google OAuth sign in...');
    console.log('Current origin:', window.location.origin);

    // Determine the correct redirect URL based on environment
    const isProduction = window.location.hostname === 'faqify.app' || window.location.hostname === 'www.faqify.app';
    const redirectUrl = isProduction ? 'https://faqify.app/dashboard' : `${window.location.origin}/dashboard`;

    console.log('Redirect URL:', redirectUrl);
    console.log('Is production:', isProduction);

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
