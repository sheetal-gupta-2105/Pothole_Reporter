import React, { useState } from 'react';
import {
  X,
  MapPin,
  Calendar,
  User,
  Phone,
  Copy,
  ExternalLink,
  Cpu,
  Layers,
  CheckCircle2,
  Sparkles,
  Eye,
  Trash2,
  Database,
} from 'lucide-react';
import type { PotholeReport, ReportStatus, ReportPriority } from '../../types/report';
import { StatusBadge, PriorityBadge, ZoneBadge } from '../common/Badge';
import { Button } from '../common/Button';
import { formatDate, formatCoordinates } from '../../utils/formatters';
import { useReports } from '../../context/ReportContext';
import { useAuth } from '../../hooks/useAuth';

interface ReportDrawerProps {
  report: PotholeReport | null;
  onClose: () => void;
}

export const ReportDrawer: React.FC<ReportDrawerProps> = ({ report, onClose }) => {
  const { updateReportStatus, updateReportPriority, deleteReport, showToast } = useReports();
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [showAnnotatedDrawer, setShowAnnotatedDrawer] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!report) return null;

  const handleCopyCoords = () => {
    navigator.clipboard.writeText(`${report.latitude}, ${report.longitude}`);
    setCopied(true);
    showToast('info', 'Coordinates Copied', `${report.latitude}, ${report.longitude}`);
    setTimeout(() => setCopied(false), 2000);
  };

  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${report.latitude},${report.longitude}`;

  const currentDisplayImage =
    showAnnotatedDrawer && report.realAiDetection?.annotatedImageUrl
      ? report.realAiDetection.annotatedImageUrl
      : report.imageUrl;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Report detail inspector"
      className="fixed inset-0 z-50 overflow-hidden flex justify-end"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div className="relative w-full max-w-xl bg-white shadow-2xl flex flex-col h-full z-10 animate-slide-left overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-slate-500">
                {report.id}
              </span>
              <StatusBadge status={report.status} size="sm" />
              <PriorityBadge priority={report.priority} size="sm" />
              {report.isLiveRecord && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                  <Database className="h-3 w-3 text-emerald-600" /> Supabase
                </span>
              )}
            </div>
            <h2 className="text-base font-bold text-slate-900 mt-1 line-clamp-1">
              {report.roadName}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close drawer"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Image Preview */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Defect Photo Evidence
              </span>
              {report.realAiDetection?.annotatedImageUrl && (
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setShowAnnotatedDrawer(true)}
                    className={`px-2 py-0.5 text-[11px] font-semibold rounded flex items-center gap-1 transition-colors ${
                      showAnnotatedDrawer
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Sparkles className="h-3 w-3" />
                    AI Annotated
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAnnotatedDrawer(false)}
                    className={`px-2 py-0.5 text-[11px] font-semibold rounded flex items-center gap-1 transition-colors ${
                      !showAnnotatedDrawer
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Eye className="h-3 w-3" />
                    Original
                  </button>
                </div>
              )}
            </div>
            <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-950 aspect-video group">
              <img
                src={currentDisplayImage}
                alt={`Pothole defect on ${report.roadName}`}
                className="w-full h-full object-cover"
                onError={(e) => {
                  // Fallback if image fails to load
                  (e.target as HTMLImageElement).src =
                    'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=800&q=80';
                }}
              />
              <div className="absolute bottom-2 left-2 px-2.5 py-1 rounded bg-black/75 backdrop-blur-xs text-[11px] text-white font-mono flex items-center gap-1.5">
                {report.realAiDetection ? (
                  <>
                    <Sparkles className="h-3 w-3 text-emerald-400" />
                    <span>
                      Real YOLOv8 Inference ({report.realAiDetection.potholesDetected} detected)
                    </span>
                  </>
                ) : (
                  <>
                    <Cpu className="h-3 w-3 text-amber-400" />
                    <span>Simulated AI Analysis Ready</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Citizen Description
            </span>
            <p className="text-sm text-slate-800 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
              {report.description || 'No additional description provided.'}
            </p>
          </div>

          {/* AI Assessment Metrics: Real vs Simulated */}
          {report.realAiDetection ? (
            <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-emerald-600" />
                  <h4 className="text-xs font-bold text-emerald-950 uppercase tracking-wider">
                    Verified AI Object Detection (YOLOv8)
                  </h4>
                </div>
                <span className="text-[10px] font-mono text-emerald-800 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded font-semibold">
                  REAL INFERENCE
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
                <div className="bg-white p-2.5 rounded-lg border border-emerald-200/60">
                  <span className="text-[10px] text-slate-500 font-medium block">
                    Potholes Detected
                  </span>
                  <span className="text-base font-extrabold text-slate-900">
                    {report.realAiDetection.potholesDetected}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-emerald-200/60">
                  <span className="text-[10px] text-slate-500 font-medium block">
                    Top Confidence
                  </span>
                  <span className="text-base font-extrabold text-emerald-700">
                    {(report.realAiDetection.highestConfidence * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-emerald-200/60">
                  <span className="text-[10px] text-slate-500 font-medium block">
                    Inference Time
                  </span>
                  <span className="text-base font-extrabold text-slate-900">
                    {report.realAiDetection.inferenceTimeMs.toFixed(0)} ms
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-emerald-200/60">
                  <span className="text-[10px] text-slate-500 font-medium block">
                    Resolution
                  </span>
                  <span className="text-xs font-extrabold text-slate-900 pt-0.5 block">
                    {report.realAiDetection.imageWidth}×{report.realAiDetection.imageHeight}
                  </span>
                </div>
              </div>

              {/* Bounding box details */}
              {report.realAiDetection.detections.length > 0 && (
                <div className="pt-2">
                  <span className="text-[11px] font-semibold text-slate-700">
                    Bounding Box Coordinates (x1, y1, x2, y2):
                  </span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {report.realAiDetection.detections.map((det, i) => (
                      <span
                        key={i}
                        className="text-[10px] bg-white border border-emerald-200 px-2 py-0.5 rounded text-emerald-900 font-mono"
                      >
                        #{i + 1}: [{det.x1.toFixed(0)}, {det.y1.toFixed(0)}, {det.x2.toFixed(0)}, {det.y2.toFixed(0)}] ({Math.round(det.confidence * 100)}%)
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[11px] text-slate-600 bg-white/80 p-2.5 rounded-lg border border-emerald-100 leading-normal">
                <span className="font-semibold text-emerald-900">Model:</span>{' '}
                {report.realAiDetection.modelName}. {report.realAiDetection.notice}
              </p>
            </div>
          ) : report.simulatedAiDetection ? (
            <div className="space-y-2 rounded-xl border border-amber-200/80 bg-amber-50/40 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-amber-600" />
                  <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                    Simulated AI Triage Assessment
                  </h4>
                </div>
                <span className="text-[10px] font-mono text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                  DEMO DATA (PHASE 1)
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                <div className="bg-white p-2.5 rounded-lg border border-amber-200/50">
                  <span className="text-[10px] text-slate-400 font-medium block">
                    Model Confidence
                  </span>
                  <span className="text-sm font-extrabold text-slate-900">
                    {report.simulatedAiDetection.confidenceScore.toFixed(1)}%
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-amber-200/50">
                  <span className="text-[10px] text-slate-400 font-medium block">
                    Simulated Depth (Uncalibrated)
                  </span>
                  <span className="text-sm font-extrabold text-slate-900">
                    {report.simulatedAiDetection.estimatedDepthCm} cm
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-amber-200/50">
                  <span className="text-[10px] text-slate-400 font-medium block">
                    Est. Surface Area
                  </span>
                  <span className="text-sm font-extrabold text-slate-900">
                    {report.simulatedAiDetection.estimatedSurfaceAreaSqM} m²
                  </span>
                </div>
              </div>

              {report.simulatedAiDetection.detectedFeatures.length > 0 && (
                <div className="pt-2">
                  <span className="text-[11px] font-semibold text-slate-600">
                    Detected Geometric Features:
                  </span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {report.simulatedAiDetection.detectedFeatures.map((feat, i) => (
                      <span
                        key={i}
                        className="text-[10px] bg-white border border-amber-200 px-2 py-0.5 rounded text-amber-900 font-medium"
                      >
                        {feat}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[11px] text-amber-800 bg-amber-100/60 p-2 rounded border border-amber-200">
                Notice: Physical depth cannot be measured from single 2D images. Values are simulated for demo interface testing.
              </p>
            </div>
          ) : null}

          {/* Location & GPS Info */}
          <div className="space-y-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Geographic Coordinates & BBMP Ward
            </span>

            <div className="p-3 rounded-lg border border-slate-200 bg-white space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-slate-500 shrink-0" />
                  <span className="font-mono text-xs font-semibold text-slate-800">
                    {formatCoordinates(report.latitude, report.longitude)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleCopyCoords}
                    className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                    title="Copy coordinates"
                  >
                    {copied ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                  <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                    title="View on Google Maps"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                <ZoneBadge zone={report.zone} />
                <span className="text-xs text-slate-500">
                  Ward #{report.wardNumber}
                </span>
                {report.duplicateCount && report.duplicateCount > 0 ? (
                  <span className="text-xs text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full font-semibold ml-auto flex items-center gap-1">
                    <Layers className="h-3 w-3" />
                    {report.duplicateCount} duplicate(s) merged
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {/* Reporter & Timestamps */}
          <div className="grid grid-cols-2 gap-3 p-3 rounded-lg border border-slate-100 bg-slate-50 text-xs">
            <div>
              <span className="text-slate-400 font-medium block">Reported By</span>
              <div className="flex items-center gap-1.5 mt-0.5 font-semibold text-slate-800">
                <User className="h-3.5 w-3.5 text-slate-400" />
                <span>{report.reporterName}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 text-slate-500">
                <Phone className="h-3 w-3 text-slate-400" />
                <span>{report.reporterContact}</span>
              </div>
            </div>

            <div>
              <span className="text-slate-400 font-medium block">Timestamp</span>
              <div className="flex items-center gap-1.5 mt-0.5 font-semibold text-slate-800">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                <span>{formatDate(report.createdAt)}</span>
              </div>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                Updated: {formatDate(report.updatedAt)}
              </span>
            </div>
          </div>

          {/* Quick Actions / Triage Controls */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Municipal Triage Controls
            </span>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  Change Status
                </label>
                <select
                  value={report.status}
                  onChange={(e) =>
                    updateReportStatus(report.id, e.target.value as ReportStatus)
                  }
                  className="w-full text-xs font-medium bg-white border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-slate-900 focus:outline-none"
                >
                  <option value="submitted">Submitted</option>
                  <option value="in_review">In Review</option>
                  <option value="verified">Verified Defect</option>
                  <option value="scheduled">Repair Scheduled</option>
                  <option value="resolved">Resolved</option>
                  <option value="rejected">Rejected / Invalid</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  Change Priority
                </label>
                <select
                  value={report.priority}
                  onChange={(e) =>
                    updateReportPriority(report.id, e.target.value as ReportPriority)
                  }
                  className="w-full text-xs font-medium bg-white border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-slate-900 focus:outline-none"
                >
                  <option value="low">Low Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="high">High Priority</option>
                  <option value="critical">Critical Priority</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          {user && report.userId && user.id === report.userId ? (
            <Button
              variant="outline"
              size="sm"
              disabled={isDeleting}
              onClick={async () => {
                if (window.confirm('Are you sure you want to delete this defect report?')) {
                  setIsDeleting(true);
                  try {
                    await deleteReport(report.id);
                    onClose();
                  } finally {
                    setIsDeleting(false);
                  }
                }
              }}
              className="text-xs text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 hover:border-red-300"
              leftIcon={<Trash2 className="h-3.5 w-3.5" />}
            >
              {isDeleting ? 'Deleting...' : 'Delete Report'}
            </Button>
          ) : (
            <div />
          )}

          <Button variant="outline" size="sm" onClick={onClose}>
            Close Inspector
          </Button>
        </div>
      </div>
    </div>
  );
};
