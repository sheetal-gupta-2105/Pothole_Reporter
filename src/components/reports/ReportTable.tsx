import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileQuestion,
} from 'lucide-react';
import type { PotholeReport } from '../../types/report';
import { StatusBadge, PriorityBadge, ZoneBadge } from '../common/Badge';
import { Button } from '../common/Button';
import { formatTimeAgo, formatDate } from '../../utils/formatters';
import { EmptyState } from '../common/EmptyState';

interface ReportTableProps {
  reports: PotholeReport[];
  onSelectReport: (report: PotholeReport) => void;
  onResetFilters?: () => void;
  pageSize?: number;
}

export const ReportTable: React.FC<ReportTableProps> = ({
  reports,
  onSelectReport,
  onResetFilters,
  pageSize = 7,
}) => {
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(reports.length / pageSize));
  const validCurrentPage = Math.min(currentPage, totalPages);

  const startIndex = (validCurrentPage - 1) * pageSize;
  const paginatedReports = reports.slice(startIndex, startIndex + pageSize);

  if (reports.length === 0) {
    return (
      <EmptyState
        icon={FileQuestion}
        title="No reports match your filters"
        description="Try adjusting your search terms, status, priority, or zonal filters to view reports."
        actionLabel={onResetFilters ? 'Clear All Filters' : undefined}
        onAction={onResetFilters}
      />
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs sm:text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[11px] tracking-wider">
              <th className="py-3 px-4">Report ID</th>
              <th className="py-3 px-4">Road & Location</th>
              <th className="py-3 px-4">BBMP Zone</th>
              <th className="py-3 px-4">Priority</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Reported</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedReports.map((report) => (
              <tr
                key={report.id}
                onClick={() => onSelectReport(report)}
                className="hover:bg-slate-50/80 cursor-pointer transition-colors group"
              >
                {/* ID & thumbnail */}
                <td className="py-3 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                  <div className="flex items-center gap-2.5">
                    <img
                      src={report.imageUrl}
                      alt="Thumbnail"
                      className="h-9 w-9 rounded-lg object-cover border border-slate-200 bg-slate-100 shrink-0"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=120&q=80';
                      }}
                    />
                    <div>
                      <span
                        className="block group-hover:text-amber-600 transition-colors"
                        title={report.id}
                      >
                        {report.id.length === 36 && report.id.includes('-')
                          ? `${report.id.slice(0, 8)}...`
                          : report.id}
                      </span>
                      {report.duplicateCount && report.duplicateCount > 0 ? (
                        <span className="text-[10px] text-orange-600 font-semibold">
                          +{report.duplicateCount} duplicate
                        </span>
                      ) : null}
                    </div>
                  </div>
                </td>

                {/* Road Name */}
                <td className="py-3 px-4 max-w-xs">
                  <p className="font-semibold text-slate-900 truncate">
                    {report.roadName}
                  </p>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    {report.description}
                  </p>
                </td>

                {/* Zone */}
                <td className="py-3 px-4 whitespace-nowrap">
                  <div className="flex flex-col gap-0.5">
                    <ZoneBadge zone={report.zone} />
                    <span className="text-[11px] text-slate-400">
                      Ward #{report.wardNumber}
                    </span>
                  </div>
                </td>

                {/* Priority */}
                <td className="py-3 px-4 whitespace-nowrap">
                  <PriorityBadge priority={report.priority} size="sm" />
                </td>

                {/* Status */}
                <td className="py-3 px-4 whitespace-nowrap">
                  <StatusBadge status={report.status} size="sm" />
                </td>

                {/* Date */}
                <td className="py-3 px-4 whitespace-nowrap text-xs text-slate-500">
                  <span title={formatDate(report.createdAt)}>
                    {formatTimeAgo(report.createdAt)}
                  </span>
                </td>

                {/* Actions */}
                <td className="py-3 px-4 text-right whitespace-nowrap">
                  <div
                    className="inline-flex items-center gap-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onSelectReport(report)}
                      leftIcon={<Eye className="h-3.5 w-3.5" />}
                      className="text-xs px-2 py-1"
                    >
                      View
                    </Button>
                    <button
                      onClick={() =>
                        navigate(`/map?lat=${report.latitude}&lng=${report.longitude}`)
                      }
                      title="Inspect on map"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                      <MapPin className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="p-3.5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between text-xs text-slate-500">
          <span>
            Page <strong>{validCurrentPage}</strong> of <strong>{totalPages}</strong> (
            {reports.length} total records)
          </span>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={validCurrentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              leftIcon={<ChevronLeft className="h-3.5 w-3.5" />}
              className="text-xs px-2 py-1"
            >
              Previous
            </Button>

            <Button
              variant="outline"
              size="sm"
              disabled={validCurrentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              rightIcon={<ChevronRight className="h-3.5 w-3.5" />}
              className="text-xs px-2 py-1"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
