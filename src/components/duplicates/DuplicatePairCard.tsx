import React from 'react';
import {
  GitMerge,
  XCircle,
  CheckCircle,
  Calendar,
  Sparkles,
  User,
  ShieldAlert,
  Binary,
} from 'lucide-react';
import type { DuplicatePair, PotholeReport } from '../../types/report';
import { Card, CardHeader, CardContent, CardFooter } from '../common/Card';
import { Button } from '../common/Button';
import { PriorityBadge } from '../common/Badge';
import { formatDate } from '../../utils/formatters';
import { useAuth } from '../../hooks/useAuth';

interface DuplicatePairCardProps {
  pair: DuplicatePair;
  primaryReport: PotholeReport | undefined;
  incomingReport: PotholeReport | undefined;
  onConfirm: (pairId: string, notes?: string) => void;
  onReject: (pairId: string, notes?: string) => void;
  onInspectReport: (report: PotholeReport) => void;
}

export const DuplicatePairCard: React.FC<DuplicatePairCardProps> = ({
  pair,
  primaryReport,
  incomingReport,
  onConfirm,
  onReject,
  onInspectReport,
}) => {
  const { user } = useAuth();

  // Citizen ownership check: only reporter of primary or incoming ticket can review live records
  const isOwner =
    !pair.isLiveRecord ||
    (user && (user.id === pair.primaryReportUserId || user.id === pair.incomingReportUserId));

  if (!primaryReport || !incomingReport) {
    return (
      <Card className="p-5 text-slate-500 text-xs">
        Data record unavailable for pair {pair.id}.
      </Card>
    );
  }

  const isReviewed = pair.status !== 'pending';

  return (
    <Card className="border-slate-300 shadow-xs hover:border-slate-400 transition-all">
      <CardHeader className="bg-slate-50/70 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-orange-100 text-orange-800 flex items-center justify-center font-bold text-xs">
            <GitMerge className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-slate-900">
                {pair.id}
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-xs font-medium text-slate-600">
                Spatial & Visual Cluster Match
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Corridor: {primaryReport.roadName.split(',')[0]}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {pair.classification && (
            <span
              className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${
                pair.classification === 'strong_duplicate'
                  ? 'bg-purple-100 text-purple-900 border-purple-300'
                  : 'bg-amber-100 text-amber-900 border-amber-300'
              }`}
            >
              <Sparkles className="h-3 w-3" />
              <span>
                {pair.classification === 'strong_duplicate'
                  ? 'Strong Duplicate Match'
                  : 'Possible Candidate'}
              </span>
            </span>
          )}

          {pair.status === 'confirmed' ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
              <span>Duplicate Confirmed & Linked</span>
            </span>
          ) : pair.status === 'rejected' ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-200 text-slate-700">
              <XCircle className="h-3.5 w-3.5 text-slate-500" />
              <span>Match Rejected (Separate Defects)</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
              <span>Pending Verification</span>
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-5 space-y-4">
        {/* Similarity Metric Pill Bar */}
        <div className="bg-slate-900 text-white rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-inner">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block">
                Geographic & Perceptual Hash Metrics
              </span>
              <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
                <span>
                  Physical Proximity:{' '}
                  <strong className="text-amber-400 font-mono">
                    {pair.distanceMeters.toFixed(1)} meters
                  </strong>
                </span>
                <span>
                  Visual Similarity:{' '}
                  <strong className="text-amber-400 font-mono">
                    {pair.simulatedVisualSimilarity.toFixed(1)}%
                  </strong>
                </span>
                {pair.hammingDistance !== undefined && (
                  <span className="flex items-center gap-1 text-slate-300 font-mono text-[11px]">
                    <Binary className="h-3.5 w-3.5 text-indigo-400" />
                    Hamming: <strong className="text-indigo-300">{pair.hammingDistance}/64 bits</strong>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-slate-400 block font-mono">
              Cluster Confidence
            </span>
            <span className="text-base font-extrabold text-emerald-400 font-mono">
              {pair.clusterConfidence.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Explainability Callout */}
        {pair.reason && (
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-start gap-2">
            <span className="font-semibold text-slate-900 shrink-0">Detection Analysis:</span>
            <span>{pair.reason}</span>
          </div>
        )}

        {/* Side-by-Side Comparison Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Primary Report */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Existing Primary Report
              </span>
              <span className="font-mono text-xs font-bold text-slate-800">
                {primaryReport.id}
              </span>
            </div>

            <div className="relative rounded-lg overflow-hidden bg-slate-900 aspect-video border border-slate-200">
              <img
                src={primaryReport.imageUrl}
                alt="Primary defect evidence"
                className="w-full h-full object-cover"
              />
              <div className="absolute top-2 left-2">
                <PriorityBadge priority={primaryReport.priority} size="sm" />
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-900 line-clamp-1">
                {primaryReport.roadName}
              </h4>
              <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                {primaryReport.description}
              </p>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {primaryReport.reporterName}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDate(primaryReport.createdAt)}
              </span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onInspectReport(primaryReport)}
              className="w-full text-xs py-1"
            >
              View Full Report #{primaryReport.id}
            </Button>
          </div>

          {/* Incoming Candidate Report */}
          <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/20 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
                Incoming Candidate Report
              </span>
              <span className="font-mono text-xs font-bold text-slate-800">
                {incomingReport.id}
              </span>
            </div>

            <div className="relative rounded-lg overflow-hidden bg-slate-900 aspect-video border border-amber-200">
              <img
                src={incomingReport.imageUrl}
                alt="Candidate defect evidence"
                className="w-full h-full object-cover"
              />
              <div className="absolute top-2 left-2">
                <PriorityBadge priority={incomingReport.priority} size="sm" />
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-900 line-clamp-1">
                {incomingReport.roadName}
              </h4>
              <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                {incomingReport.description}
              </p>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-amber-200/60">
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {incomingReport.reporterName}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDate(incomingReport.createdAt)}
              </span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onInspectReport(incomingReport)}
              className="w-full text-xs py-1"
            >
              View Full Report #{incomingReport.id}
            </Button>
          </div>
        </div>

        {/* Audit Notes if reviewed */}
        {pair.reviewNotes && (
          <div className="bg-slate-100 p-3 rounded-lg text-xs text-slate-700">
            <strong>Triage Review Note:</strong> {pair.reviewNotes} (Reviewed at{' '}
            {pair.reviewedAt ? formatDate(pair.reviewedAt) : 'Recently'})
          </div>
        )}
      </CardContent>

      {/* Review Actions Footer */}
      {!isReviewed && (
        <CardFooter className="flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            {isOwner ? (
              <span>Action will cluster tickets to prevent duplicate contractor dispatches.</span>
            ) : (
              <span className="flex items-center gap-1.5 text-amber-800 font-medium bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
                <ShieldAlert className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                View only: Only the citizen who submitted either report can confirm or reject this match.
              </span>
            )}
          </div>

          {isOwner && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onReject(pair.id, 'Distinct road defect')}
                leftIcon={<XCircle className="h-4 w-4 text-slate-500" />}
                className="text-xs"
              >
                Reject Match
              </Button>

              <Button
                variant="primary"
                size="sm"
                onClick={() => onConfirm(pair.id, 'Verified duplicate road complaint')}
                leftIcon={<GitMerge className="h-4 w-4 text-amber-400" />}
                className="text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800"
              >
                Confirm Duplicate & Merge
              </Button>
            </div>
          )}
        </CardFooter>
      )}
    </Card>
  );
};
