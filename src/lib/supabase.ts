import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

/**
 * Supabase Foundation Configuration for Pothole Reporter
 *
 * Environment variables:
 * - VITE_SUPABASE_URL: Project API URL (https://<project-ref>.supabase.co)
 * - VITE_SUPABASE_PUBLISHABLE_KEY: Public Anon Key (safe for browser use)
 *
 * SECURITY:
 * Never use or expose the Supabase service_role / secret key in frontend code.
 */

const rawUrl: string | undefined = import.meta.env.VITE_SUPABASE_URL;
const rawKey: string | undefined =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;

export const SUPABASE_TABLES = {
  REPORTS: 'reports',
} as const;

export const SUPABASE_BUCKETS = {
  ORIGINALS: 'pothole-originals',
  ANNOTATED: 'pothole-annotated',
} as const;

export interface SupabaseConfigStatus {
  isConfigured: boolean;
  url: string | null;
  errorMessage: string | null;
}

/**
 * Validates whether the Supabase frontend environment variables are properly set.
 */
export function getSupabaseConfigStatus(): SupabaseConfigStatus {
  if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    return {
      isConfigured: false,
      url: null,
      errorMessage:
        'Missing VITE_SUPABASE_URL. Please set VITE_SUPABASE_URL in your .env file.',
    };
  }

  if (rawUrl.includes('your-project-id') || !rawUrl.startsWith('http')) {
    return {
      isConfigured: false,
      url: rawUrl,
      errorMessage:
        'VITE_SUPABASE_URL is set to a placeholder or invalid URL. Replace with your actual project URL from the Supabase dashboard.',
    };
  }

  if (!rawKey || typeof rawKey !== 'string' || rawKey.trim() === '') {
    return {
      isConfigured: false,
      url: rawUrl,
      errorMessage:
        'Missing VITE_SUPABASE_PUBLISHABLE_KEY. Please set VITE_SUPABASE_PUBLISHABLE_KEY in your .env file.',
    };
  }

  if (rawKey.includes('your-supabase') || rawKey.includes('placeholder')) {
    return {
      isConfigured: false,
      url: rawUrl,
      errorMessage:
        'VITE_SUPABASE_PUBLISHABLE_KEY contains placeholder text. Replace with your project anon public key.',
    };
  }

  return {
    isConfigured: true,
    url: rawUrl,
    errorMessage: null,
  };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfigStatus().isConfigured;
}

const configStatus = getSupabaseConfigStatus();

let clientInstance: SupabaseClient<Database> | null = null;

if (configStatus.isConfigured && rawUrl && rawKey) {
  try {
    clientInstance = createClient<Database>(rawUrl, rawKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  } catch (err) {
    console.error('[Pothole Reporter] Failed to initialize Supabase client:', err);
  }
} else {
  // Inform developer with actionable instructions without crashing the app
  console.info(
    `[Pothole Reporter] Supabase foundation is active in mock/local mode.\n` +
      `Reason: ${configStatus.errorMessage}\n` +
      `To connect your live Supabase database:\n` +
      `  1. Create a .env file in the project root.\n` +
      `  2. Copy settings from .env.example.\n` +
      `  3. Add your VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.`
  );
}

/**
 * Main Supabase client instance (or null if unconfigured).
 */
export const supabase = clientInstance;

/**
 * Returns the initialized Supabase client or throws a descriptive error.
 */
export function getSupabaseClient(): SupabaseClient<Database> {
  if (!clientInstance) {
    const { errorMessage } = getSupabaseConfigStatus();
    throw new Error(
      `Supabase client is not configured: ${errorMessage || 'Unknown error'}. Check your .env file.`
    );
  }
  return clientInstance;
}
