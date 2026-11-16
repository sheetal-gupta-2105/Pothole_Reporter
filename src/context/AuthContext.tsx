import React, { createContext, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import type { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured, getSupabaseConfigStatus } from '../lib/supabase';
import { clearSignedUrlCache } from '../services/storage';

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
  isPasswordRecovery: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | Error | null }>;
  signUp: (
    email: string,
    password: string,
    fullName?: string
  ) => Promise<{
    error: AuthError | Error | null;
    data: { user: User | null; session: Session | null } | null;
  }>;
  signOut: () => Promise<{ error: AuthError | Error | null }>;
  requestPasswordReset: (email: string) => Promise<{ error: AuthError | Error | null }>;
  updatePassword: (password: string) => Promise<{ error: AuthError | Error | null }>;
  cancelPasswordRecovery: () => void;
  resendConfirmation: (email: string) => Promise<{ error: AuthError | Error | null }>;
  enableDemoSession: () => Promise<{ error: AuthError | Error | null }>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEMO_USER_STORAGE_KEY = 'pothole_reporter_demo_session';
const PASSWORD_RECOVERY_STORAGE_KEY = 'pothole_reporter_password_recovery_user';

const readPasswordRecoveryMarker = (): string | null => {
  try {
    return typeof window === 'undefined'
      ? null
      : sessionStorage.getItem(PASSWORD_RECOVERY_STORAGE_KEY);
  } catch {
    return null;
  }
};

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
  const passwordRecoveryUserIdRef = useRef<string | null>(readPasswordRecoveryMarker());
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
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
  const authUserIdRef = useRef<string | null>(user?.id ?? null);
  const demoModeRef = useRef(isDemoUser);
  const demoSwitchInProgressRef = useRef(false);
  const demoSwitchGenerationRef = useRef(0);
  const authEventVersionRef = useRef(0);

  const setPasswordRecoveryUserId = useCallback((userId: string | null) => {
    passwordRecoveryUserIdRef.current = userId;
    try {
      if (userId) {
        sessionStorage.setItem(PASSWORD_RECOVERY_STORAGE_KEY, userId);
      } else {
        sessionStorage.removeItem(PASSWORD_RECOVERY_STORAGE_KEY);
      }
    } catch {
      // Recovery remains available for this page session if storage is blocked.
    }
    setIsPasswordRecovery(userId !== null);
  }, []);

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

    // Restore existing session unless this browser already chose demo mode.
    const restoreEventVersion = authEventVersionRef.current;
    supabase.auth
      .getSession()
      .then(({ data: { session: existingSession }, error }) => {
        if (!mounted) return;
        if (restoreEventVersion !== authEventVersionRef.current) return;

        const recoveryUserId = passwordRecoveryUserIdRef.current;
        if (recoveryUserId && existingSession?.user.id === recoveryUserId) {
          if (authUserIdRef.current !== existingSession.user.id) {
            clearSignedUrlCache();
            authUserIdRef.current = existingSession.user.id;
          }
          demoModeRef.current = false;
          localStorage.removeItem(DEMO_USER_STORAGE_KEY);
          setPasswordRecoveryUserId(existingSession.user.id);
          setSession(existingSession);
          setUser(existingSession.user);
          setIsDemoUser(false);
          setLoading(false);
          return;
        }
        if (recoveryUserId) setPasswordRecoveryUserId(null);
        if (demoModeRef.current || localStorage.getItem(DEMO_USER_STORAGE_KEY) === 'true') {
          demoModeRef.current = true;
          setUser(MOCK_DEMO_USER);
          setSession(null);
          setIsDemoUser(true);
          setLoading(false);
          return;
        }
        if (error) {
          console.warn('[Pothole Reporter] Error restoring session:', error.message);
        }
        if (existingSession) {
          setSession(existingSession);
          setUser(existingSession.user);
          demoModeRef.current = false;
          setIsDemoUser(false);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!mounted || restoreEventVersion !== authEventVersionRef.current) return;
        console.warn('[Pothole Reporter] Failed to get session:', err);
        setPasswordRecoveryUserId(null);
        setLoading(false);
      });

    // Listen for auth state changes (sign in, sign out, token refresh, password recovery)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, currentSession) => {
      if (!mounted) return;
      authEventVersionRef.current += 1;

      if (event === 'SIGNED_OUT') {
        setPasswordRecoveryUserId(null);
      } else if (event === 'PASSWORD_RECOVERY' && currentSession) {
        demoSwitchGenerationRef.current += 1;
        demoSwitchInProgressRef.current = false;
        demoModeRef.current = false;
        localStorage.removeItem(DEMO_USER_STORAGE_KEY);
        setPasswordRecoveryUserId(currentSession.user.id);
      } else if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecoveryUserId(null);
      } else if (passwordRecoveryUserIdRef.current) {
        const recoveryUserId = passwordRecoveryUserIdRef.current;
        const currentUserId = currentSession?.user.id ?? null;
        const isRecoveryContinuationEvent =
          event === 'INITIAL_SESSION' ||
          event === 'TOKEN_REFRESHED' ||
          event === 'USER_UPDATED';

        if (currentUserId === recoveryUserId && isRecoveryContinuationEvent) {
          setPasswordRecoveryUserId(currentUserId);
        } else {
          setPasswordRecoveryUserId(null);
        }
      }

      if (demoSwitchInProgressRef.current) return;

      if (demoModeRef.current && !(event === 'SIGNED_IN' && currentSession)) {
        setLoading(false);
        return;
      }

      if (event === 'SIGNED_IN' && currentSession) {
        demoModeRef.current = false;
        localStorage.removeItem(DEMO_USER_STORAGE_KEY);
      }

      const nextUserId = currentSession?.user?.id ?? null;

      // Clear cached private image URLs only when the authenticated
      // user's identity changes, not during ordinary token refreshes.
      if (authUserIdRef.current !== nextUserId) {
        clearSignedUrlCache();
        authUserIdRef.current = nextUserId;
      }

      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setIsDemoUser(false);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [configured, setPasswordRecoveryUserId]);

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
        demoModeRef.current = false;
        setPasswordRecoveryUserId(null);
        setSession(data.session);
        setUser(data.user);
        setIsDemoUser(false);
        localStorage.removeItem(DEMO_USER_STORAGE_KEY);
      }

      return { error };
    },
    [configured, setPasswordRecoveryUserId]
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
        demoModeRef.current = false;
        setPasswordRecoveryUserId(null);
        setSession(data.session);
        setUser(data.user);
        setIsDemoUser(false);
        localStorage.removeItem(DEMO_USER_STORAGE_KEY);
      }

      return {
        error,
        data: data ? { user: data.user, session: data.session } : null,
      };
    },
    [configured, setPasswordRecoveryUserId]
  );

  // Sign Out
  const signOut = useCallback(async (): Promise<{ error: AuthError | Error | null }> => {
    if (configured && supabase) {
      try {
        const { error } = await supabase.auth.signOut();
        if (error) return { error };
      } catch (err) {
        console.warn('[Pothole Reporter] Error during sign out:', err);
        return {
          error: err instanceof Error ? err : new Error('Could not sign out of the portal.'),
        };
      }
    }
    demoModeRef.current = false;
    localStorage.removeItem(DEMO_USER_STORAGE_KEY);
    setPasswordRecoveryUserId(null);
    clearSignedUrlCache();
    authUserIdRef.current = null;
    setIsDemoUser(false);
    setUser(null);
    setSession(null);
    return { error: null };
  }, [configured, setPasswordRecoveryUserId]);

  const requestPasswordReset = useCallback(
    async (email: string): Promise<{ error: AuthError | Error | null }> => {
      if (!configured || !supabase) {
        return { error: new Error('Password recovery is unavailable because Supabase is not configured.') };
      }

      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        return { error };
      } catch (error) {
        return {
          error: error instanceof Error ? error : new Error('Could not request a password reset email.'),
        };
      }
    },
    [configured]
  );

  const updatePassword = useCallback(
    async (password: string): Promise<{ error: AuthError | Error | null }> => {
      if (!configured || !supabase) {
        return { error: new Error('Password recovery is unavailable because Supabase is not configured.') };
      }

      const recoveryUserId = passwordRecoveryUserIdRef.current;
      if (!recoveryUserId || demoModeRef.current) {
        return { error: new Error('This password recovery link is invalid or expired. Request a new link.') };
      }

      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) return { error: sessionError };
        if (!data.session || data.session.user.id !== recoveryUserId) {
          setPasswordRecoveryUserId(null);
          return { error: new Error('This password recovery link is invalid or expired. Request a new link.') };
        }

        const { error } = await supabase.auth.updateUser({ password });
        if (!error) setPasswordRecoveryUserId(null);
        return { error };
      } catch (error) {
        return {
          error: error instanceof Error ? error : new Error('Could not update the password.'),
        };
      }
    },
    [configured, setPasswordRecoveryUserId]
  );

  const cancelPasswordRecovery = useCallback(() => {
    setPasswordRecoveryUserId(null);
  }, [setPasswordRecoveryUserId]);

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

  // Enable local demo mode after ending this browser's live Supabase session.
  const enableDemoSession = useCallback(async (): Promise<{ error: AuthError | Error | null }> => {
    const switchGeneration = ++demoSwitchGenerationRef.current;
    const restoreLiveSession = async () => {
      if (!supabase) return;
      try {
        const { data } = await supabase.auth.getSession();
        const restoredSession = data.session;
        const restoredUserId = restoredSession?.user?.id ?? null;
        if (authUserIdRef.current !== restoredUserId) {
          clearSignedUrlCache();
          authUserIdRef.current = restoredUserId;
        }
        setSession(restoredSession);
        setUser(restoredSession?.user ?? null);
        setIsDemoUser(false);
        setLoading(false);
      } catch (restoreError) {
        console.warn('[Pothole Reporter] Failed to restore session after demo sign-out error:', restoreError);
      }
    };

    if (configured && supabase) {
      demoSwitchInProgressRef.current = true;
      try {
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        if (error) {
          demoSwitchInProgressRef.current = false;
          if (!demoModeRef.current) await restoreLiveSession();
          return { error };
        }
      } catch (error) {
        demoSwitchInProgressRef.current = false;
        if (!demoModeRef.current) await restoreLiveSession();
        return {
          error: error instanceof Error ? error : new Error('Could not sign out of the live account.'),
        };
      }
      demoSwitchInProgressRef.current = false;
      if (switchGeneration !== demoSwitchGenerationRef.current) {
        return { error: new Error('A password recovery session became active before demo mode could be enabled.') };
      }
    }

    demoModeRef.current = true;
    authUserIdRef.current = null;
    setPasswordRecoveryUserId(null);
    localStorage.setItem(DEMO_USER_STORAGE_KEY, 'true');
    clearSignedUrlCache();
    setSession(null);
    setUser(MOCK_DEMO_USER);
    setIsDemoUser(true);
    setLoading(false);
    return { error: null };
  }, [configured, setPasswordRecoveryUserId]);

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
      isPasswordRecovery,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
      updatePassword,
      cancelPasswordRecovery,
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
      isPasswordRecovery,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
      updatePassword,
      cancelPasswordRecovery,
      resendConfirmation,
      enableDemoSession,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
