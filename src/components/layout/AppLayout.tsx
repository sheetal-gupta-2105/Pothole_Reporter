import React, { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import {
  Menu,
  PlusCircle,
  RotateCcw,
  ShieldCheck,
  AlertTriangle,
  Info,
  User,
  LogOut,
  Database,
  CheckCircle2,
} from 'lucide-react';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { ToastContainer } from '../common/Toast';
import { Button } from '../common/Button';
import { useReports } from '../../context/ReportContext';
import { useAuth } from '../../hooks/useAuth';

export const AppLayout: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { resetToDefaults, duplicates, showToast, isLiveSync, error } = useReports();
  const { user, profile, signOut, isDemoUser } = useAuth();
  const location = useLocation();

  const pendingDuplicates = duplicates.filter((d) => d.status === 'pending').length;

  const getPageTitle = () => {
    switch (location.pathname) {
      case '/':
        return 'Overview Dashboard';
      case '/report':
        return 'Report a Road Defect';
      case '/map':
        return 'Bengaluru Defect Map';
      case '/reports':
        return 'Citizen Complaints & Reports';
      case '/duplicates':
        return 'Duplicate Review Queue';
      case '/settings':
        return 'System Settings & Tools';
      default:
        return 'Pothole Reporter';
    }
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans">
      {/* Desktop Persistent Sidebar */}
      <div className="hidden lg:block h-full shrink-0">
        <Sidebar />
      </div>

      {/* Mobile Drawer */}
      <MobileNav
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200/90 px-3 sm:px-6 flex items-center justify-between shrink-0 z-10 shadow-2xs">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open sidebar menu"
              className="lg:hidden p-1.5 sm:p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base md:text-lg font-bold text-slate-900 tracking-tight leading-tight truncate">
                {getPageTitle()}
              </h2>
              <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1 truncate">
                <span className="hidden sm:inline text-[11px] text-slate-400 font-medium shrink-0">
                  Bengaluru Ward Network
                </span>
                <span className="hidden sm:inline h-1 w-1 rounded-full bg-slate-300 shrink-0" />
                {isDemoUser ? (
                  <span className="text-[10px] sm:text-[11px] text-amber-600 font-medium flex items-center gap-1 shrink-0">
                    <ShieldCheck className="h-3 w-3" /> Demo Mode
                  </span>
                ) : error ? (
                  <span className="text-[10px] sm:text-[11px] text-orange-700 font-semibold flex items-center gap-1 truncate" title={error}>
                    <AlertTriangle className="h-3 w-3 shrink-0" /> {isLiveSync ? 'Live Data · Refresh Failed' : 'Live Sync Error'}
                  </span>
                ) : isLiveSync ? (
                  <span className="text-[10px] sm:text-[11px] text-emerald-600 font-semibold flex items-center gap-1 shrink-0">
                    <Database className="h-3 w-3" /> Live Supabase Synced
                  </span>
                ) : (
                  <span className="text-[10px] sm:text-[11px] text-slate-500 font-medium flex items-center gap-1 shrink-0">
                    <Info className="h-3 w-3" /> Live Sync Unavailable
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 shrink-0">
            {pendingDuplicates > 0 && (
              <Link
                to="/duplicates"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-orange-50 border border-orange-200 text-orange-800 hover:bg-orange-100 transition-colors"
              >
                <AlertTriangle className="h-3.5 w-3.5 text-orange-600" />
                <span>{pendingDuplicates} Duplicates to Review</span>
              </Link>
            )}

            {isDemoUser && (
              <Button
                variant="outline"
                size="sm"
                onClick={resetToDefaults}
                leftIcon={<RotateCcw className="h-3.5 w-3.5 text-slate-500" />}
                className="hidden md:inline-flex text-xs"
                title="Reset deterministic demo dataset"
              >
                Reset Data
              </Button>
            )}

            <Link to="/report" title="Report a road defect" aria-label="New Report">
              <Button
                variant="primary"
                size="sm"
                leftIcon={<PlusCircle className="h-4 w-4 text-amber-400" />}
                className="text-xs sm:text-sm font-semibold shadow-xs px-2.5 sm:px-3.5"
              >
                <span className="hidden sm:inline">New Report</span>
                <span className="sm:hidden sr-only">New Report</span>
              </Button>
            </Link>

            {/* Citizen Profile & Logout */}
            {user && (
              <div className="flex items-center gap-1 sm:gap-2 pl-1.5 sm:pl-3 border-l border-slate-200">
                <div className="hidden xl:flex flex-col text-right">
                  <span className="text-xs font-bold text-slate-900 leading-tight">
                    {profile?.fullName || 'Citizen Reporter'}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono leading-tight">
                    {isDemoUser ? 'Demo Session' : user.email}
                  </span>
                </div>
                <div
                  className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0"
                  title={user.email || 'Citizen'}
                  aria-label={profile?.fullName || user.email || 'Citizen profile'}
                >
                  <User className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-600" />
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const { error: signOutError } = await signOut();
                    if (signOutError) {
                      showToast('error', 'Could Not Sign Out', signOutError.message);
                      return;
                    }
                    showToast('info', 'Signed Out', 'You have been logged out of the citizen portal.');
                  }}
                  aria-label="Sign out"
                  title="Sign out of portal"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Civic System Status Banner */}
        <div className="bg-slate-100 border-b border-slate-200/80 px-4 sm:px-6 py-1.5 flex items-center justify-between text-[11px] text-slate-600">
          <div className="flex items-center gap-1.5">
            {isDemoUser ? (
              <>
                <Info className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                <span><strong>Demo Mode Active:</strong> Operating with local deterministic data.</span>
              </>
            ) : error ? (
              <>
                <AlertTriangle className="h-3.5 w-3.5 text-orange-600 shrink-0" />
                <span>
                  <strong>{isLiveSync ? 'Live Data May Be Stale:' : 'Live Sync Error:'}</strong> {error}
                </span>
              </>
            ) : isLiveSync ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span>
                  <strong>Live System Active:</strong> Persistent PostgreSQL grievance ledger, private image storage, and real YOLOv8 inference enabled.
                </span>
              </>
            ) : (
              <>
                <Info className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                <span>
                  <strong>Live Sync Unavailable:</strong> No synchronized live report data is currently available.
                </span>
              </>
            )}
          </div>
          <span className="hidden sm:inline text-slate-400 font-mono text-[10px]">
            BBMP Road Defect System (Student Prototype)
          </span>
        </div>

        {/* Scrollable Page Body */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Global Toast Notifications */}
      <ToastContainer />
    </div>
  );
};
