import React, { useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useReports } from '../context/ReportContext';
import { LeafletMap } from '../components/map/LeafletMap';
import { ReportDrawer } from '../components/reports/ReportDrawer';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/common/Button';
import { PlusCircle, MapPin, Database } from 'lucide-react';

export const MapPage: React.FC = () => {
  const { reports, duplicates, isLiveSync, isLoading, error } = useReports();
  const { isDemoUser } = useAuth();
  const [searchParams] = useSearchParams();
  const reportsKey = JSON.stringify(reports.map((report) => report.id));
  const [reportSelection, setReportSelection] = useState(() => ({
    reportId: null as string | null,
    reportsKey,
  }));

  if (reportSelection.reportsKey !== reportsKey) {
    const stillAvailable = reportSelection.reportId !== null &&
      reports.some((report) => report.id === reportSelection.reportId);
    setReportSelection({
      reportId: stillAvailable ? reportSelection.reportId : null,
      reportsKey,
    });
  }

  const selectReport = (reportId: string | null) => {
    setReportSelection({ reportId, reportsKey });
  };
  const selectedReport = reportSelection.reportId
    ? reports.find((report) => report.id === reportSelection.reportId) ?? null
    : null;

  const selectedCoordinates = useMemo(() => {
    const queryLat = searchParams.get('lat');
    const queryLng = searchParams.get('lng');
    if (queryLat === null || queryLng === null || !queryLat.trim() || !queryLng.trim()) return null;

    const lat = Number(queryLat);
    const lng = Number(queryLng);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 || lat > 90 ||
      lng < -180 || lng > 180
    ) {
      return null;
    }

    return { lat, lng };
  }, [searchParams]);

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Spatial Intelligence Map
            </span>
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold border px-2 py-0.5 rounded-full ${
              isDemoUser
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : error
                  ? 'bg-orange-50 text-orange-800 border-orange-200'
                  : isLiveSync
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-slate-50 text-slate-700 border-slate-200'
            }`} title={error || undefined}>
              {isDemoUser ? (
                'Local Demo Mode'
              ) : error ? (
                <>{isLiveSync ? 'Live Data · Refresh Failed' : 'Live Sync Error'}</>
              ) : isLiveSync ? (
                <><Database className="h-3 w-3 text-emerald-600" /> Supabase Live</>
              ) : (
                isLoading ? 'Connecting to Live Reports' : 'Live Sync Unavailable'
              )}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5">
            Bengaluru Road Defect GIS Map
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Interactive defect distribution across BBMP zones with status and severity filters.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link to="/report">
            <Button
              variant="primary"
              size="sm"
              leftIcon={<PlusCircle className="h-4 w-4 text-amber-400" />}
              className="font-bold text-xs"
            >
              Report Pothole
            </Button>
          </Link>
        </div>
      </div>

      {/* Map Information Strip */}
      <div className="flex items-center justify-between text-xs text-slate-500 bg-white px-3 sm:px-4 py-2 rounded-lg border border-slate-200">
        <div className="flex items-center gap-2 min-w-0">
          <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span className="truncate sm:whitespace-normal">
            Centered on Greater Bengaluru. Click any defect pin to inspect photo, depth, and
            status.
          </span>
        </div>
        <span className="text-[11px] text-slate-400 font-mono hidden md:inline shrink-0 ml-2">
          OpenStreetMap Tile Engine
        </span>
      </div>

      {/* Full-width Map Container */}
      <LeafletMap
        reports={reports}
        duplicates={duplicates}
        onSelectReport={(report) => selectReport(report.id)}
        selectedCoordinates={selectedCoordinates}
        className="h-[calc(100vh-280px)] sm:h-[calc(100vh-250px)] lg:h-[calc(100vh-230px)] min-h-[380px] sm:min-h-[480px] lg:min-h-[550px] shadow-sm"
      />

      {/* Report Details Drawer */}
      <ReportDrawer
        report={selectedReport}
        onClose={() => selectReport(null)}
        onSelectReport={(report) => selectReport(report.id)}
      />
    </div>
  );
};
