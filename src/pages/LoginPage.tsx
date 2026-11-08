import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  ShieldAlert,
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ArrowRight,
  Info,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/common/Button';

export const LoginPage: React.FC = () => {
  const { signIn, user, isConfigured, configError, enableDemoSession, resendConfirmation } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('confirmed') === 'true' || window.location.hash.includes('access_token')) {
        return 'Email confirmed successfully! You can now access the civic dashboard.';
      }
    }
    return null;
  });
  const [resendingEmail, setResendingEmail] = useState(false);
  const [showResendBtn, setShowResendBtn] = useState(false);

  // Read destination redirect from state
  const fromLocation = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  // If user is already authenticated, redirect
  useEffect(() => {
    if (user) {
      navigate(fromLocation, { replace: true });
    }
  }, [user, navigate, fromLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setShowResendBtn(false);

    if (!email.trim()) {
      setErrorMessage('Please enter your email address.');
      return;
    }

    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await signIn(email, password);
      if (error) {
        if (error.message.toLowerCase().includes('email not confirmed')) {
          setErrorMessage('Email address has not been confirmed yet. Please verify your inbox.');
          setShowResendBtn(true);
        } else if (error.message.toLowerCase().includes('invalid login credentials')) {
          setErrorMessage('Invalid email or password. Please check your credentials.');
        } else {
          setErrorMessage(error.message);
        }
      } else {
        navigate(fromLocation, { replace: true });
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred during login.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!email.trim()) return;
    setResendingEmail(true);
    try {
      const { error } = await resendConfirmation(email);
      if (error) {
        setErrorMessage(`Failed to resend confirmation: ${error.message}`);
      } else {
        setSuccessMessage(`Verification email resent to ${email}. Please check your inbox.`);
        setShowResendBtn(false);
      }
    } catch {
      setErrorMessage('Failed to resend verification email.');
    } finally {
      setResendingEmail(false);
    }
  };

  const handleDemoLogin = () => {
    enableDemoSession();
    navigate(fromLocation, { replace: true });
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 p-4 sm:p-6 font-sans">
      <div className="w-full max-w-md space-y-6">
        {/* Brand & Title */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 rounded-2xl bg-slate-900 text-amber-400 items-center justify-center shadow-md">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Citizen Portal Login
          </h1>
          <p className="text-xs text-slate-500 max-w-xs mx-auto">
            Bengaluru Road Intelligence & Duplicate-Aware Civic Reporting Platform
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xl p-6 sm:p-8 space-y-5">
          {/* Status Banners */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2.5 animate-fade-in">
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <p className="font-semibold">{errorMessage}</p>
                {showResendBtn && (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendingEmail}
                    className="text-[11px] font-bold text-red-700 underline hover:text-red-900 flex items-center gap-1 mt-1"
                  >
                    {resendingEmail && <Loader2 className="h-3 w-3 animate-spin" />}
                    Resend Confirmation Email
                  </button>
                )}
              </div>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2.5 animate-fade-in">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="font-semibold">{successMessage}</p>
            </div>
          )}

          {!isConfigured && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Supabase Foundation (Demo Mode)</p>
                  <p className="text-[11px] text-amber-800/90 mt-0.5">
                    {configError || 'Supabase credentials are not set in .env.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleDemoLogin}
                className="w-full py-1.5 px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-xs"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-200" />
                Explore in Demo Mode (Bypass Login)
              </button>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Citizen Email Address <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com / user@gmail.com"
                  required
                  autoComplete="email"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all placeholder:text-slate-400"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700">
                  Password <span className="text-red-500">*</span>
                </label>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full pl-9 pr-10 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="md"
              fullWidth
              disabled={submitting}
              className="mt-2 font-semibold shadow-sm"
              leftIcon={submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
              rightIcon={!submitting ? <ArrowRight className="h-4 w-4 text-amber-400" /> : undefined}
            >
              {submitting ? 'Authenticating...' : 'Sign In to Portal'}
            </Button>
          </form>

          {/* Registration Link */}
          <div className="pt-2 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-600">
              New citizen reporter?{' '}
              <Link
                to="/register"
                className="font-bold text-slate-900 hover:text-amber-600 transition-colors underline"
              >
                Register a civic account
              </Link>
            </p>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center text-[11px] text-slate-400">
          <span>BBMP Bruhat Bengaluru Mahanagara Palike • Civic Triage</span>
        </div>
      </div>
    </div>
  );
};
