import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Download,
  PlusCircle,
  MapPin,
  RefreshCw,
  Database,
  AlertCircle,
  Loader2,
  Info,
} from 'lucide-react';
import { useReports } from '../context/ReportContext';
import { ReportFilters } from '../components/reports/ReportFilters';
import { ReportTable } from '../components/reports/ReportTable';
import { ReportDrawer } from '../components/reports/ReportDrawer';
import { Button } from '../components/common/Button';
import type { FilterOptions, PotholeReport } from '../types/report';
import { exportReportsAsJSON, exportReportsAsGeoJSON } from '../utils/export';

export const ReportsPage: React.FC = () => {
  const { reports, isLoading, error, refreshReports, isLiveSync } = useReports();
  const [selectedReport, setSelectedReport] = useState<PotholeReport | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [filters, setFilters] = useState<FilterOptions>({
    search: '',
    status: 'all',
    priority: 'all',
    zone: 'all',
    sortBy: 'newest',
  });

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshReports();
    } finally {
      setIsRefreshing(false);
    }
  };

  const filteredReports = useMemo(() => {
    return reports
      .filter((report) => {
        // Search filter
        if (filters.search) {
          const q = filters.search.toLowerCase();
          const matchesId = report.id.toLowerCase().includes(q);
          const matchesRoad = report.roadName.toLowerCase().includes(q);
          const matchesDesc = report.description.toLowerCase().includes(q);
          const matchesReporter = report.reporterName.toLowerCase().includes(q);
          if (!matchesId && !matchesRoad && !matchesDesc && !matchesReporter) {
            return false;
          }
        }

        // Status filter
        if (filters.status !== 'all' && report.status !== filters.status) {
          return false;
        }

        // Priority filter
        if (filters.priority !== 'all' && report.priority !== filters.priority) {
          return false;
        }

        // Zone filter
        if (filters.zone !== 'all' && report.zone !== filters.zone) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (filters.sortBy === 'newest') {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        if (filters.sortBy === 'oldest') {
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        }
        if (filters.sortBy === 'priority') {
          const priorityWeights = { critical: 4, high: 3, medium: 2, low: 1 };
          return priorityWeights[b.priority] - priorityWeights[a.priority];
        }
        if (filters.sortBy === 'severity') {
          const depthB =
            b.simulatedAiDetection?.estimatedDepthCm ??
            (b.realAiDetection ? b.realAiDetection.potholesDetected * 5 : 0);
          const depthA =
            a.simulatedAiDetection?.estimatedDepthCm ??
            (a.realAiDetection ? a.realAiDetection.potholesDetected * 5 : 0);
          return depthB - depthA;
        }
        return 0;
      });
  }, [reports, filters]);

  return (
    <div className="space-y-5">
      {/* Page Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Civic Registry
            </span>
            {isLiveSync ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full">
                <Database className="h-3 w-3 text-emerald-600" /> Supabase Live Synced
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full">
                <Info className="h-3 w-3 text-amber-600" /> Local Demo Mode
              </span>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5">
            Pothole Reports & Grievance Ledger
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Searchable log of citizen-submitted road defects, verified AI triage telemetry, and municipal repair status.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            disabled={isRefreshing || isLoading}
            leftIcon={
              <RefreshCw
                className={`h-3.5 w-3.5 text-slate-500 ${isRefreshing || isLoading ? 'animate-spin' : ''}`}
              />
            }
            className="text-xs"
            title="Refresh reports ledger from database"
          >
            Refresh
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => exportReportsAsGeoJSON(filteredReports)}
            leftIcon={<MapPin className="h-3.5 w-3.5 text-slate-500" />}
            className="text-xs"
            title="Download GeoJSON for QGIS / Mapbox"
          >
            Export GeoJSON
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => exportReportsAsJSON(filteredReports)}
            leftIcon={<Download className="h-3.5 w-3.5 text-slate-500" />}
            className="text-xs"
            title="Download JSON record dump"
          >
            Export JSON
          </Button>

          <Link to="/report">
            <Button
              variant="primary"
              size="sm"
              leftIcon={<PlusCircle className="h-4 w-4 text-amber-400" />}
              className="text-xs font-bold"
            >
              Report Pothole
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={handleManualRefresh} className="text-xs">
            Retry Sync
          </Button>
        </div>
      )}

      {/* Filter Toolbar */}
      <ReportFilters
        filters={filters}
        onChange={setFilters}
        totalFiltered={filteredReports.length}
        totalAvailable={reports.length}
      />

      {/* Table & Inspector */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center flex flex-col items-center justify-center space-y-3">
          <Loader2 className="h-8 w-8 text-amber-500 animate-spin" />
          <p className="text-xs font-bold text-slate-700">Loading live reports from Supabase...</p>
        </div>
      ) : (
        <ReportTable
          reports={filteredReports}
          onSelectReport={(report) => setSelectedReport(report)}
          onResetFilters={() =>
            setFilters({
              search: '',
              status: 'all',
              priority: 'all',
              zone: 'all',
              sortBy: 'newest',
            })
          }
        />
      )}

      {/* Slide-out Report Drawer */}
      <ReportDrawer report={selectedReport} onClose={() => setSelectedReport(null)} />
    </div>
  );
};
