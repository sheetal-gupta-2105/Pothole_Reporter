import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CheckCircle2, Lock, ShieldAlert } from 'lucide-react';
import { Button } from '../components/common/Button';
import { useAuth } from '../hooks/useAuth';

export const PasswordRecoveryPage: React.FC = () => {
  const {
    user,
    session,
    loading,
    isConfigured,
    isDemoUser,
    isPasswordRecovery,
    updatePassword,
    cancelPasswordRecovery,
    signOut,
  } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReturningToLogin, setIsReturningToLogin] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasRecoverySession =
    isConfigured &&
    isPasswordRecovery &&
    !isDemoUser &&
    Boolean(user) &&
    session?.user.id === user?.id;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);

    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please re-enter.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await updatePassword(password);
      if (error) {
        setErrorMessage(error.message || 'The recovery link may be invalid or expired. Request a new link.');
        return;
      }
      setIsComplete(true);
      setPassword('');
      setConfirmPassword('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not update the password. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReturnToLogin = async () => {
    setErrorMessage(null);
    setIsReturningToLogin(true);
    try {
      const { error } = await signOut();
      if (error) {
        setErrorMessage(`Your password was updated, but sign-out did not complete: ${error.message}`);
        return;
      }
      navigate('/login?password_updated=true', { replace: true });
    } catch (error) {
      setErrorMessage(
        `Your password was updated, but sign-out did not complete: ${error instanceof Error ? error.message : 'Please try again.'}`
      );
    } finally {
      setIsReturningToLogin(false);
    }
  };

  const handleCancelRecovery = () => {
    cancelPasswordRecovery();
    navigate(user && !isDemoUser ? '/' : '/login', { replace: true });
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 p-4 sm:p-6 font-sans">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 rounded-2xl bg-slate-900 text-amber-400 items-center justify-center shadow-md">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Reset Your Password</h1>
          <p className="text-xs text-slate-500 max-w-xs mx-auto">
            Choose a new password for your citizen account.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xl p-6 sm:p-8 space-y-5">
          {loading ? (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 text-center">
              Validating your secure recovery link…
            </div>
          ) : isComplete ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-start gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <p>Your password was updated. Sign out of the recovery session, then log in with your new password.</p>
              </div>
              {errorMessage && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                  <p>{errorMessage}</p>
                </div>
              )}
              <Button
                type="button"
                variant="primary"
                size="md"
                fullWidth
                onClick={handleReturnToLogin}
                isLoading={isReturningToLogin}
                disabled={isReturningToLogin}
                rightIcon={<ArrowLeft className="h-4 w-4" />}
              >
                Return to Login
              </Button>
            </div>
          ) : hasRecoverySession ? (
            <>
              {errorMessage && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2.5">
                  <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                  <p>{errorMessage}</p>
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="new-password" className="text-xs font-semibold text-slate-700 block mb-1">
                    New Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Lock className="h-4 w-4" />
                    </div>
                    <input
                      id="new-password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="At least 6 characters"
                      required
                      minLength={6}
                      autoComplete="new-password"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all placeholder:text-slate-400"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="confirm-new-password" className="text-xs font-semibold text-slate-700 block mb-1">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Lock className="h-4 w-4" />
                    </div>
                    <input
                      id="confirm-new-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="Re-enter your new password"
                      required
                      minLength={6}
                      autoComplete="new-password"
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
                  Update Password
                </Button>
              </form>
              <button
                type="button"
                onClick={handleCancelRecovery}
                className="w-full text-center text-xs font-semibold text-slate-600 hover:text-slate-900 underline"
              >
                Cancel password recovery
              </button>
            </>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p>
                  This recovery link is missing, invalid, expired, or already used. Request a new reset link to continue.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Link to="/forgot-password" className="flex-1">
                  <Button type="button" variant="primary" size="md" fullWidth>
                    Request a New Link
                  </Button>
                </Link>
                <Link to="/login" className="flex-1">
                  <Button type="button" variant="outline" size="md" fullWidth>
                    Back to Login
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
