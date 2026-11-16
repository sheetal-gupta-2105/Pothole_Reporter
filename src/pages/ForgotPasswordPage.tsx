import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CheckCircle2, Lock, Mail, ShieldAlert } from 'lucide-react';
import { Button } from '../components/common/Button';
import { useAuth } from '../hooks/useAuth';

export const ForgotPasswordPage: React.FC = () => {
  const { requestPasswordReset, isConfigured, isDemoUser } = useAuth();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);

    if (!email.trim()) {
      setErrorMessage('Enter the email address associated with your account.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await requestPasswordReset(email);
      if (error) {
        setErrorMessage('We could not process the request right now. Check your connection and try again.');
        return;
      }
      setSubmitted(true);
    } catch {
      setErrorMessage('We could not process the request right now. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const recoveryUnavailable = !isConfigured || isDemoUser;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 p-4 sm:p-6 font-sans">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 rounded-2xl bg-slate-900 text-amber-400 items-center justify-center shadow-md">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Forgot Password?</h1>
          <p className="text-xs text-slate-500 max-w-xs mx-auto">
            Request a secure password reset link for your citizen account.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xl p-6 sm:p-8 space-y-5">
          {recoveryUnavailable ? (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p>
                Password recovery is available for configured Supabase accounts. Demo mode does not use a password.
              </p>
            </div>
          ) : submitted ? (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <p>
                If an account is associated with <strong>{email.trim()}</strong>, a password reset email will be sent. Check your inbox and spam folder.
              </p>
            </div>
          ) : (
            <>
              {errorMessage && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2.5">
                  <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                  <p>{errorMessage}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="recovery-email" className="text-xs font-semibold text-slate-700 block mb-1">
                    Citizen Email Address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Mail className="h-4 w-4" />
                    </div>
                    <input
                      id="recovery-email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="name@example.com"
                      required
                      autoComplete="email"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all placeholder:text-slate-400"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  fullWidth
                  isLoading={isSubmitting}
                  disabled={isSubmitting}
                  leftIcon={!isSubmitting ? <Lock className="h-4 w-4 text-amber-400" /> : undefined}
                >
                  Send Reset Link
                </Button>
              </form>
            </>
          )}

          <div className="pt-2 border-t border-slate-100 text-center">
            <Link to="/login" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-amber-700 underline">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
