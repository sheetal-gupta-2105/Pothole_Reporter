import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  FileText,
  Clock,
  CopyCheck,
  AlertOctagon,
  ArrowRight,
  PlusCircle,
  MapPin,
  Database,
} from 'lucide-react';
import { useReports } from '../context/ReportContext';
import { StatCard } from '../components/dashboard/StatCard';
import { StatusDistributionChart } from '../components/dashboard/StatusDistributionChart';
import { PriorityChart } from '../components/dashboard/PriorityChart';
import { WardSummaryCard } from '../components/dashboard/WardSummaryCard';
import { ReportTable } from '../components/reports/ReportTable';
import { ReportDrawer } from '../components/reports/ReportDrawer';
import { Button } from '../components/common/Button';
import type { PotholeReport } from '../types/report';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { reports, duplicates, isLiveSync } = useReports();
  const [selectedReport, setSelectedReport] = useState<PotholeReport | null>(null);

  const totalReports = reports.length;
  const awaitingReview = reports.filter(
    (r) => r.status === 'submitted' || r.status === 'in_review'
  ).length;
  const pendingDuplicates = duplicates.filter((d) => d.status === 'pending').length;
  const highPriority = reports.filter(
    (r) => r.priority === 'critical' || r.priority === 'high'
  ).length;

  const recentReports = reports.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Top Banner / Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white p-6 rounded-2xl shadow-sm border border-slate-700">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-400 text-slate-900 tracking-wide uppercase">
              Bengaluru BBMP
            </span>
            {isLiveSync ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <Database className="h-3 w-3" /> Live Supabase Connected
              </span>
            ) : (
              <span className="text-slate-400 text-xs">Ward Defect Management System (Demo)</span>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-black mt-2 tracking-tight">
            Civic Road Defect & Duplicate Intelligence
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
            Automated citizen complaint ingestion, real YOLOv8 computer vision defect detection,
            and duplicate-aware reporting across Bengaluru arterial roads.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Link to="/map">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<MapPin className="h-4 w-4" />}
              className="bg-slate-800/80 border-slate-600 text-slate-200 hover:bg-slate-700 hover:text-white"
            >
              View Live Map
            </Button>
          </Link>
          <Link to="/report">
            <Button
              variant="primary"
              size="sm"
              leftIcon={<PlusCircle className="h-4 w-4 text-amber-400" />}
              className="bg-amber-400 text-slate-950 hover:bg-amber-300 font-bold"
            >
              Report Pothole
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Reports"
          value={totalReports}
          subtitle="Registered defect complaints"
          icon={FileText}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
          onClick={() => navigate('/reports')}
        />

        <StatCard
          title="Awaiting Review"
          value={awaitingReview}
          subtitle="Submitted or pending triage"
          icon={Clock}
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
          onClick={() => navigate('/reports')}
        />

        <StatCard
          title="Potential Duplicates"
          value={pendingDuplicates}
          subtitle="Clustered within 50m radius"
          icon={CopyCheck}
          iconColor="text-orange-600"
          iconBg="bg-orange-50"
          accentBorder={pendingDuplicates > 0 ? 'border-orange-300 bg-orange-50/20' : ''}
          onClick={() => navigate('/duplicates')}
        />

        <StatCard
          title="High & Critical Priority"
          value={highPriority}
          subtitle="Severe crater hazards"
          icon={AlertOctagon}
          iconColor="text-red-600"
          iconBg="bg-red-50"
          onClick={() => navigate('/reports')}
        />
      </div>

      {/* Visual Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <StatusDistributionChart reports={reports} />
        <PriorityChart reports={reports} />
      </div>

      {/* Geographic Ward Breakdown */}
      <WardSummaryCard reports={reports} />

      {/* Recent Reports Table Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Recent Defect Submissions
            </h3>
            <p className="text-xs text-slate-500">
              Latest citizen reports received from Bengaluru municipal wards
            </p>
          </div>
          <Link
            to="/reports"
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-900 transition-colors"
          >
            <span>View All Reports</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <ReportTable
          reports={recentReports}
          onSelectReport={(report) => setSelectedReport(report)}
          pageSize={5}
        />
      </div>

      {/* Report Drawer */}
      <ReportDrawer
        report={selectedReport}
        onClose={() => setSelectedReport(null)}
      />
    </div>
  );
};
