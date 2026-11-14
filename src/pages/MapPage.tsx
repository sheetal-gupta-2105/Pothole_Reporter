import React, { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useReports } from '../context/ReportContext';
import { LeafletMap } from '../components/map/LeafletMap';
import { ReportDrawer } from '../components/reports/ReportDrawer';
import type { PotholeReport } from '../types/report';
import { Button } from '../components/common/Button';
import { PlusCircle, MapPin, Database } from 'lucide-react';

export const MapPage: React.FC = () => {
  const { reports, duplicates, isLiveSync } = useReports();
  const [searchParams] = useSearchParams();
  const [selectedReport, setSelectedReport] = useState<PotholeReport | null>(null);

  const queryLat = searchParams.get('lat');
  const queryLng = searchParams.get('lng');

  const selectedCoordinates =
    queryLat && queryLng
      ? { lat: parseFloat(queryLat), lng: parseFloat(queryLng) }
      : null;

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Spatial Intelligence Map
            </span>
            {isLiveSync && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full">
                <Database className="h-3 w-3 text-emerald-600" /> Supabase Live
              </span>
            )}
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
      <div className="flex items-center justify-between text-xs text-slate-500 bg-white px-4 py-2 rounded-lg border border-slate-200">
        <div className="flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5 text-slate-400" />
          <span>
            Centered on Greater Bengaluru. Click any defect pin to inspect photo, depth, and
            status.
          </span>
        </div>
        <span className="text-[11px] text-slate-400 font-mono hidden md:inline">
          OpenStreetMap Tile Engine
        </span>
      </div>

      {/* Full-width Map Container */}
      <LeafletMap
        reports={reports}
        duplicates={duplicates}
        onSelectReport={(report) => setSelectedReport(report)}
        selectedCoordinates={selectedCoordinates}
        className="h-[calc(100vh-230px)] min-h-[550px] shadow-sm"
      />

      {/* Report Details Drawer */}
      <ReportDrawer
        report={selectedReport}
        onClose={() => setSelectedReport(null)}
      />
    </div>
  );
};
