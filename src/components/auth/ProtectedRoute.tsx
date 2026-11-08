import React from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

export const ProtectedRoute: React.FC = () => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 text-slate-800">
        <div className="flex flex-col items-center p-8 bg-white rounded-2xl shadow-xl border border-slate-200/80 max-w-sm w-full mx-4 text-center">
          <div className="h-12 w-12 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center shadow-md mb-4">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900">Pothole Reporter</h3>
          <p className="text-xs text-slate-500 mt-1 mb-6">Restoring citizen session...</p>
          <Loader2 className="h-6 w-6 text-amber-500 animate-spin" />
        </div>
      </div>
    );
  }

  if (!user) {
    // Preserve requested location to redirect back after sign-in
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
};
