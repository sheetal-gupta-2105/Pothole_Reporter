import React, { useState } from 'react';
import {
  GitMerge,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { useReports } from '../context/ReportContext';
import { DuplicatePairCard } from '../components/duplicates/DuplicatePairCard';
import { ReportDrawer } from '../components/reports/ReportDrawer';
import type { PotholeReport } from '../types/report';
import { EmptyState } from '../components/common/EmptyState';

export const DuplicatesPage: React.FC = () => {
  const { duplicates, confirmDuplicate, rejectDuplicate, getReportById, isLoading } =
    useReports();
  const [selectedReport, setSelectedReport] = useState<PotholeReport | null>(null);
  const [tab, setTab] = useState<'pending' | 'confirmed' | 'rejected' | 'all'>(
    'pending'
  );

  const pendingCount = duplicates.filter((d) => d.status === 'pending').length;
  const confirmedCount = duplicates.filter((d) => d.status === 'confirmed').length;
  const rejectedCount = duplicates.filter((d) => d.status === 'rejected').length;

  const filteredDuplicates = duplicates.filter((d) => {
    if (tab === 'all') return true;
    return d.status === tab;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Deduplication Engine
          </span>
        </div>
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5">
          Duplicate Report Review Queue
        </h1>
        <p className="text-xs sm:text-sm text-slate-500">
          Clustered candidate pairs identified by spatial proximity and simulated visual similarity.
        </p>
      </div>

      {/* Phase 4 AI & Duplicate clustering explanation callout */}
      <div className="p-4 rounded-xl border border-orange-200 bg-orange-50/60 flex items-start gap-3 text-xs text-orange-900">
        <Sparkles className="h-4.5 w-4.5 text-orange-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-orange-950">
            Phase 4 Civic Deduplication Engine (Haversine Spatial & pHash Visual Analysis):
          </p>
          <p className="leading-relaxed text-slate-700">
            Incoming complaints within a 50-meter radius undergo Discrete Cosine Transform (DCT)
            perceptual image hashing and Hamming distance evaluation. Confirming links the duplicate ticket
            to prevent redundant contractor dispatches. Rejecting verifies the complaints as distinct defect sites.
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setTab('pending')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              tab === 'pending'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            <span>Pending Review</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                tab === 'pending'
                  ? 'bg-amber-400 text-slate-900'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {pendingCount}
            </span>
          </button>

          <button
            onClick={() => setTab('confirmed')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              tab === 'confirmed'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Confirmed Duplicates</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                tab === 'confirmed'
                  ? 'bg-emerald-400 text-slate-900'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {confirmedCount}
            </span>
          </button>

          <button
            onClick={() => setTab('rejected')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              tab === 'rejected'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <XCircle className="h-3.5 w-3.5" />
            <span>Rejected Matches</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                tab === 'rejected'
                  ? 'bg-slate-300 text-slate-900'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {rejectedCount}
            </span>
          </button>

          <button
            onClick={() => setTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              tab === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>All Pairs ({duplicates.length})</span>
          </button>
        </div>
      </div>

      {/* Duplicate Pairs List */}
      {isLoading && duplicates.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center flex flex-col items-center justify-center space-y-3 shadow-xs">
          <Loader2 className="h-8 w-8 text-amber-500 animate-spin" />
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-800">
              Scanning duplicate review queue...
            </p>
            <p className="text-[11px] text-slate-500 max-w-sm">
              Analyzing spatial proximity and perceptual image hashes from Supabase.
            </p>
          </div>
        </div>
      ) : filteredDuplicates.length === 0 ? (
        <EmptyState
          icon={GitMerge}
          title={
            tab === 'pending'
              ? 'Duplicate Review Queue is Clean'
              : `No ${tab} duplicate records`
          }
          description={
            tab === 'pending'
              ? 'No pending duplicate pairs require human verification. Any new report filed within 50m will appear here.'
              : 'There are currently no records under this triage state.'
          }
        />
      ) : (
        <div className="space-y-5">
          {filteredDuplicates.map((pair) => (
            <DuplicatePairCard
              key={pair.id}
              pair={pair}
              primaryReport={getReportById(pair.primaryReportId)}
              incomingReport={getReportById(pair.incomingReportId)}
              onConfirm={(pairId, notes) => confirmDuplicate(pairId, notes)}
              onReject={(pairId, notes) => rejectDuplicate(pairId, notes)}
              onInspectReport={(report) => setSelectedReport(report)}
            />
          ))}
        </div>
      )}

      {/* Report Drawer for Inspection */}
      <ReportDrawer
        report={selectedReport}
        onClose={() => setSelectedReport(null)}
      />
    </div>
  );
};
