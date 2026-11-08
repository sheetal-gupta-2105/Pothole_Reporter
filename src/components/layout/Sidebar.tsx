import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  PlusCircle,
  MapPin,
  FileText,
  CopyCheck,
  Settings,
  ShieldAlert,
  Radio,
  LogOut,
} from 'lucide-react';
import { useReports } from '../../context/ReportContext';
import { useAuth } from '../../hooks/useAuth';

interface SidebarProps {
  onNavClick?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onNavClick }) => {
  const { reports, duplicates } = useReports();
  const { user, profile, signOut, isDemoUser } = useAuth();

  const pendingDuplicatesCount = duplicates.filter(
    (d) => d.status === 'pending'
  ).length;

  const navItems = [
    {
      to: '/',
      label: 'Overview',
      icon: LayoutDashboard,
      badge: undefined,
    },
    {
      to: '/report',
      label: 'Report Pothole',
      icon: PlusCircle,
      badge: 'New',
      badgeColor: 'bg-emerald-100 text-emerald-800',
    },
    {
      to: '/map',
      label: 'Interactive Map',
      icon: MapPin,
      badge: undefined,
    },
    {
      to: '/reports',
      label: 'All Reports',
      icon: FileText,
      badge: `${reports.length}`,
      badgeColor: 'bg-slate-200 text-slate-700',
    },
    {
      to: '/duplicates',
      label: 'Duplicate Review',
      icon: CopyCheck,
      badge:
        pendingDuplicatesCount > 0 ? `${pendingDuplicatesCount} Pending` : undefined,
      badgeColor: 'bg-orange-100 text-orange-800 font-semibold',
    },
    {
      to: '/settings',
      label: 'Settings & Tools',
      icon: Settings,
      badge: undefined,
    },
  ];

  return (
    <aside className="h-full flex flex-col bg-white border-r border-slate-200/90 w-64 select-none">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-md">
            <ShieldAlert className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 leading-tight">
              Pothole Reporter
            </h1>
            <p className="text-xs font-medium text-slate-500">
              Bengaluru Civic Tech
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50/80 border border-amber-200/60 text-[11px] text-amber-800 font-medium">
          <Radio className="h-3 w-3 text-amber-600 animate-pulse" />
          <span>Demo Environment • Phase 1</span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          Main Navigation
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavClick}
              end={item.to === '/'}
              className={({ isActive }) =>
                `group flex items-center justify-between px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div className="flex items-center gap-3">
                    <Icon
                      className={`h-4.5 w-4.5 shrink-0 transition-colors ${
                        isActive
                          ? 'text-amber-400'
                          : 'text-slate-400 group-hover:text-slate-700'
                      }`}
                    />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full ${
                        isActive
                          ? 'bg-slate-800 text-amber-300'
                          : item.badgeColor || 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}

        {/* Citizen Auth Indicator in Sidebar */}
        {user && (
          <div className="pt-3 mt-2 border-t border-slate-100">
            <div className="px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200/80 flex items-center justify-between">
              <div className="min-w-0 pr-2">
                <p className="text-xs font-bold text-slate-800 truncate">
                  {profile?.fullName || 'Citizen'}
                </p>
                <p className="text-[10px] text-slate-400 font-mono truncate">
                  {isDemoUser ? 'Demo Citizen' : user.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => signOut()}
                aria-label="Sign out"
                title="Sign out of portal"
                className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* Footer Info */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/60">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span className="font-medium text-slate-700">Target Region</span>
          <span className="text-slate-900 font-semibold">Bengaluru BBMP</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
          <span>Client Prototype</span>
          <span className="font-mono">v0.1.0-alpha</span>
        </div>
      </div>
    </aside>
  );
};
