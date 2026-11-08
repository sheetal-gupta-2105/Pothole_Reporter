import React, { createContext, useEffect, useState, useMemo, useCallback } from 'react';
import type { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured, getSupabaseConfigStatus } from '../lib/supabase';

export interface CitizenProfile {
  id: string;
  email: string | null;
  fullName: string | null;
  role: string;
}

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: CitizenProfile | null;
  loading: boolean;
  isConfigured: boolean;
  configError: string | null;
  isDemoUser: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | Error | null }>;
  signUp: (
    email: string,
    password: string,
    fullName?: string
  ) => Promise<{
    error: AuthError | Error | null;
    data: { user: User | null; session: Session | null } | null;
  }>;
  signOut: () => Promise<void>;
  resendConfirmation: (email: string) => Promise<{ error: AuthError | Error | null }>;
  enableDemoSession: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEMO_USER_STORAGE_KEY = 'pothole_reporter_demo_session';

const MOCK_DEMO_USER: User = {
  id: 'demo-citizen-blr-001',
  app_metadata: { provider: 'demo' },
  user_metadata: { full_name: 'Bengaluru Citizen (Demo)' },
  aud: 'authenticated',
  confirmation_sent_at: new Date().toISOString(),
  confirmed_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  email: 'citizen.demo@bengaluru.gov.in',
  email_confirmed_at: new Date().toISOString(),
  identities: [],
  phone: '',
  role: 'authenticated',
  updated_at: new Date().toISOString(),
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const configured = isSupabaseConfigured();
  const configStatus = getSupabaseConfigStatus();

  const [session, setSession] = useState<Session | null>(null);
  const [isDemoUser, setIsDemoUser] = useState(() => {
    return localStorage.getItem(DEMO_USER_STORAGE_KEY) === 'true';
  });
  const [user, setUser] = useState<User | null>(() => {
    if (localStorage.getItem(DEMO_USER_STORAGE_KEY) === 'true') {
      return MOCK_DEMO_USER;
    }
    return null;
  });
  const [loading, setLoading] = useState(() => configured && Boolean(supabase));

  // Helper to extract a display-ready CitizenProfile from Supabase User
  const extractProfile = useCallback((u: User | null): CitizenProfile | null => {
    if (!u) return null;
    const fullName =
      (u.user_metadata?.full_name as string) ||
      (u.user_metadata?.name as string) ||
      (u.email ? u.email.split('@')[0] : 'Citizen');
    return {
      id: u.id,
      email: u.email ?? null,
      fullName,
      role: u.role || 'authenticated',
    };
  }, []);

  // Initialize session on mount
  useEffect(() => {
    // If Supabase is not configured, initialization is complete
    if (!configured || !supabase) {
      return;
    }

    let mounted = true;

    // Restore existing session
    supabase.auth
      .getSession()
      .then(({ data: { session: existingSession }, error }) => {
        if (!mounted) return;
        if (error) {
          console.warn('[Pothole Reporter] Error restoring session:', error.message);
        }
        if (existingSession) {
          setSession(existingSession);
          setUser(existingSession.user);
          setIsDemoUser(false);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        console.warn('[Pothole Reporter] Failed to get session:', err);
        setLoading(false);
      });

    // Listen for auth state changes (sign in, sign out, token refresh, password recovery)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (!mounted) return;
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setIsDemoUser(false);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [configured]);

  // Sign In with email and password
  const signIn = useCallback(
    async (email: string, password: string): Promise<{ error: AuthError | Error | null }> => {
      if (!configured || !supabase) {
        // Fallback for unconfigured mode
        return {
          error: new Error(
            'Supabase is not configured. Please add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to your .env file, or click "Explore in Demo Mode".'
          ),
        };
      }

      const { error, data } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (!error && data.session) {
        setSession(data.session);
        setUser(data.user);
        setIsDemoUser(false);
        localStorage.removeItem(DEMO_USER_STORAGE_KEY);
      }

      return { error };
    },
    [configured]
  );

  // Sign Up new citizen
  const signUp = useCallback(
    async (
      email: string,
      password: string,
      fullName?: string
    ): Promise<{
      error: AuthError | Error | null;
      data: { user: User | null; session: Session | null } | null;
    }> => {
      if (!configured || !supabase) {
        return {
          error: new Error(
            'Supabase is not configured. Please add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to your .env file.'
          ),
          data: null,
        };
      }

      // Configure email confirmation redirect URL to point back to application
      const redirectUrl = `${window.location.origin}/login?confirmed=true`;

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: fullName?.trim() || 'Citizen',
          },
        },
      });

      if (!error && data.session) {
        setSession(data.session);
        setUser(data.user);
        setIsDemoUser(false);
      }

      return {
        error,
        data: data ? { user: data.user, session: data.session } : null,
      };
    },
    [configured]
  );

  // Sign Out
  const signOut = useCallback(async () => {
    localStorage.removeItem(DEMO_USER_STORAGE_KEY);
    setIsDemoUser(false);
    setUser(null);
    setSession(null);

    if (configured && supabase) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn('[Pothole Reporter] Error during sign out:', err);
      }
    }
  }, [configured]);

  // Resend confirmation email
  const resendConfirmation = useCallback(
    async (email: string): Promise<{ error: AuthError | Error | null }> => {
      if (!configured || !supabase) {
        return {
          error: new Error('Supabase is not configured.'),
        };
      }

      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/login?confirmed=true`,
        },
      });

      return { error };
    },
    [configured]
  );

  // Enable demo session for unconfigured environment testing
  const enableDemoSession = useCallback(() => {
    localStorage.setItem(DEMO_USER_STORAGE_KEY, 'true');
    setUser(MOCK_DEMO_USER);
    setIsDemoUser(true);
    setSession(null);
  }, []);

  const profile = useMemo(() => extractProfile(user), [user, extractProfile]);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      session,
      profile,
      loading,
      isConfigured: configured,
      configError: configStatus.errorMessage,
      isDemoUser,
      signIn,
      signUp,
      signOut,
      resendConfirmation,
      enableDemoSession,
    }),
    [
      user,
      session,
      profile,
      loading,
      configured,
      configStatus.errorMessage,
      isDemoUser,
      signIn,
      signUp,
      signOut,
      resendConfirmation,
      enableDemoSession,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
