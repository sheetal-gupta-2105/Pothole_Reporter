import React from 'react';
import { useReports } from '../../context/ReportContext';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
} from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useReports();

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom,1rem))] right-[max(1rem,env(safe-area-inset-right,1rem))] left-3 sm:left-auto max-w-[calc(100vw-1.5rem)] sm:max-w-sm z-50 flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((toast) => {
        const iconConfig = {
          success: <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />,
          error: <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />,
          warning: <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />,
          info: <Info className="h-5 w-5 text-blue-600 shrink-0" />,
        }[toast.type];

        const borderConfig = {
          success: 'border-emerald-200 bg-white',
          error: 'border-rose-200 bg-white',
          warning: 'border-amber-200 bg-white',
          info: 'border-blue-200 bg-white',
        }[toast.type];

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto p-3.5 sm:p-4 rounded-xl border shadow-lg flex items-start gap-3 transition-all transform translate-y-0 ${borderConfig}`}
          >
            {iconConfig}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 leading-snug">{toast.title}</p>
              {toast.message && (
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  {toast.message}
                </p>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              aria-label="Dismiss toast"
              className="text-slate-400 hover:text-slate-600 p-2 -mr-1.5 -mt-1.5 rounded-lg flex items-center justify-center min-h-[38px] min-w-[38px] touch-manipulation transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
