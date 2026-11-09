import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Send,
  Info,
  CheckCircle2,
  ArrowLeft,
  Sparkles,
  AlertCircle,
  Loader2,
  Database,
  UploadCloud,
} from 'lucide-react';
import { useReports } from '../context/ReportContext';
import { useAuth } from '../hooks/useAuth';
import { ImageUploader } from '../components/submission/ImageUploader';
import { LocationPicker } from '../components/submission/LocationPicker';
import { Button } from '../components/common/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/common/Card';
import type { BBMPZone, ReportPriority, RealAIDetection } from '../types/report';
import { detectPotholes, type DetectionResponse } from '../services/api';

export const ReportPage: React.FC = () => {
  const navigate = useNavigate();
  const { createReport, showToast, isLiveSync } = useReports();
  const { user, profile } = useAuth();

  // Form State
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [roadName, setRoadName] = useState('');
  const [zone, setZone] = useState<BBMPZone>('Mahadevapura');
  const [wardNumber, setWardNumber] = useState<number>(150);
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [description, setDescription] = useState('');
  const [reporterName, setReporterName] = useState(() => profile?.fullName || '');
  const [reporterContact, setReporterContact] = useState(() => user?.email || '');
  const [priority, setPriority] = useState<ReportPriority>('high');

  // Real AI Detection State
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionResult, setDetectionResult] = useState<DetectionResponse | null>(null);
  const [detectionError, setDetectionError] = useState<string | null>(null);

  // Validation & Submission State
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionStage, setSubmissionStage] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submissionSuccess, setSubmissionSuccess] = useState<{
    id: string;
    roadName: string;
    priority: ReportPriority;
    isLiveRecord?: boolean;
    realAiDetection?: RealAIDetection;
  } | null>(null);

  const zones: BBMPZone[] = [
    'Mahadevapura',
    'Bommanahalli',
    'East Zone',
    'West Zone',
    'South Zone',
    'Rajarajeshwari Nagar',
    'Yelahanka',
    'Dasarahalli',
  ];

  const runDetection = async (file: File | Blob) => {
    setIsDetecting(true);
    setDetectionError(null);

    try {
      const result = await detectPotholes(file);
      setDetectionResult(result);

      if (result.potholes_detected > 0) {
        // Automatically suggest priority based on real YOLO detection
        setPriority(result.suggested_priority);
        showToast(
          'success',
          'YOLOv8 Detection Complete',
          `Found ${result.potholes_detected} pothole(s) with peak model confidence ${(result.highest_confidence * 100).toFixed(1)}%.`
        );
      } else {
        showToast(
          'info',
          'No Potholes Detected',
          'The model found 0 potholes meeting the confidence threshold in this image.'
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Detection failed';
      setDetectionError(msg);
      setDetectionResult(null);
      showToast(
        'error',
        'AI Detection Unavailable',
        `${msg} (No artificial score will be fabricated)`
      );
    } finally {
      setIsDetecting(false);
    }
  };

  const handleImageSelected = (file: File | null, previewUrl: string | null) => {
    setImageFile(file);
    setImagePreviewUrl(previewUrl);

    if (previewUrl && errors.image) {
      setErrors((prev) => {
        const copy = { ...prev };
        delete copy.image;
        return copy;
      });
    }

    if (file) {
      // Trigger real AI detection against the backend
      void runDetection(file);
    } else {
      setDetectionResult(null);
      setDetectionError(null);
    }
  };

  const handleRetryDetection = () => {
    if (imageFile) {
      void runDetection(imageFile);
    }
  };

  const handleLocationChange = (
    lat: string,
    lng: string,
    road?: string,
    z?: BBMPZone,
    w?: number
  ) => {
    setLatitude(lat);
    setLongitude(lng);
    if (road) setRoadName(road);
    if (z) setZone(z);
    if (w) setWardNumber(w);

    if (errors.latitude || errors.longitude) {
      setErrors((prev) => {
        const copy = { ...prev };
        delete copy.latitude;
        delete copy.longitude;
        return copy;
      });
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!imagePreviewUrl) {
      newErrors.image = 'Road defect photograph is required.';
    }

    if (!latitude) {
      newErrors.latitude = 'Latitude is required.';
    } else {
      const latNum = parseFloat(latitude);
      if (isNaN(latNum) || latNum < -90 || latNum > 90) {
        newErrors.latitude = 'Please enter a valid latitude (-90 to 90).';
      }
    }

    if (!longitude) {
      newErrors.longitude = 'Longitude is required.';
    } else {
      const lngNum = parseFloat(longitude);
      if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
        newErrors.longitude = 'Please enter a valid longitude (-180 to 180).';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmissionError(null);

    if (!validateForm()) return;

    setIsSubmitting(true);
    setSubmissionStage('Preparing report payload...');

    try {
      // 1. Resolve photo file (if user chose sample image, fetch as blob)
      let fileToUpload: File | Blob | null = imageFile;
      if (!fileToUpload && imagePreviewUrl) {
        setSubmissionStage('Processing road photograph...');
        try {
          const res = await fetch(imagePreviewUrl);
          fileToUpload = await res.blob();
        } catch {
          fileToUpload = new Blob([new Uint8Array(10)], { type: 'image/jpeg' });
        }
      }

      if (!fileToUpload) {
        throw new Error('Please select or upload a valid road photograph.');
      }

      // 2. Build real AI detection payload if real detection was run
      const realAiPayload: RealAIDetection | undefined = detectionResult
        ? {
            isRealInference: true,
            potholesDetected: detectionResult.potholes_detected,
            detections: detectionResult.detections,
            annotatedImageUrl: detectionResult.annotated_image || undefined,
            imageWidth: detectionResult.image_width,
            imageHeight: detectionResult.image_height,
            inferenceTimeMs: detectionResult.inference_time_ms,
            modelName: detectionResult.model_name,
            highestConfidence: detectionResult.highest_confidence,
            suggestedPriority: detectionResult.suggested_priority,
            notice: detectionResult.notice,
          }
        : undefined;

      setSubmissionStage('Uploading images to private Supabase Storage...');

      // 3. Persist report to Supabase (or demo state)
      const created = await createReport({
        userId: user?.id || 'demo-citizen-blr-001',
        roadName: roadName.trim() || 'Unspecified Bengaluru Corridor',
        zone,
        wardNumber: Number(wardNumber) || 150,
        description: description.trim(),
        priority,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        originalFile: fileToUpload,
        reporterName: reporterName.trim() || profile?.fullName || 'Citizen Reporter',
        reporterContact: reporterContact.trim() || user?.email || '+91 Unspecified',
        realAiDetection: realAiPayload,
      });

      setSubmissionStage(null);
      setSubmissionSuccess({
        id: created.id,
        roadName: created.roadName,
        priority: created.priority,
        isLiveRecord: created.isLiveRecord,
        realAiDetection: realAiPayload,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred during submission.';
      setSubmissionError(msg);
      setSubmissionStage(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetForAnother = () => {
    setImageFile(null);
    setImagePreviewUrl(null);
    setRoadName('');
    setLatitude('');
    setLongitude('');
    setDescription('');
    setDetectionResult(null);
    setDetectionError(null);
    setSubmissionSuccess(null);
    setSubmissionError(null);
    setErrors({});
  };

  if (submissionSuccess) {
    return (
      <div className="max-w-2xl mx-auto py-8">
        <Card className="border-emerald-200 bg-white p-8 text-center space-y-5 shadow-lg">
          <div className="h-16 w-16 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 mx-auto">
            <CheckCircle2 className="h-8 w-8" />
          </div>

          <div>
            <div className="flex items-center justify-center gap-2 mb-1">
              <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest block">
                Complaint Successfully Lodged
              </span>
              {submissionSuccess.isLiveRecord && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
                  <Database className="h-3 w-3 text-emerald-600" /> Supabase Persisted
                </span>
              )}
            </div>
            <h2 className="text-2xl font-black text-slate-900 mt-1">
              Report ID: {submissionSuccess.id}
            </h2>
            <p className="text-sm text-slate-600 mt-2 max-w-md mx-auto">
              Your defect report on <strong>{submissionSuccess.roadName}</strong> has been
              registered and linked to your citizen profile in the BBMP civic dashboard.
            </p>
          </div>

          {/* Real AI Inference Breakdown */}
          {submissionSuccess.realAiDetection ? (
            <div className="p-4 rounded-xl bg-slate-900 text-white text-left max-w-lg mx-auto text-xs space-y-3 shadow-inner">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-400" />
                  <span className="font-bold text-amber-300">
                    Verified YOLOv8 Inference Results
                  </span>
                </div>
                <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30">
                  REAL AI INFERENCE
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 text-slate-300">
                <div className="bg-slate-800/80 p-2 rounded">
                  <span className="text-[10px] text-slate-400 block">Potholes Detected</span>
                  <span className="text-sm font-bold text-white">
                    {submissionSuccess.realAiDetection.potholesDetected}
                  </span>
                </div>
                <div className="bg-slate-800/80 p-2 rounded">
                  <span className="text-[10px] text-slate-400 block">Peak Confidence</span>
                  <span className="text-sm font-bold text-amber-400">
                    {(submissionSuccess.realAiDetection.highestConfidence * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="bg-slate-800/80 p-2 rounded">
                  <span className="text-[10px] text-slate-400 block">Inference Time</span>
                  <span className="text-sm font-bold text-white">
                    {submissionSuccess.realAiDetection.inferenceTimeMs} ms
                  </span>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 border-t border-slate-800/80 pt-2 space-y-1">
                <p>
                  <strong>Model Checkpoint:</strong> {submissionSuccess.realAiDetection.modelName} (YOLOv8s)
                </p>
                <p className="text-amber-200/90 text-[10px]">
                  <strong>Physical Measurement Notice:</strong> Depth is not estimated. Single 2D RGB imagery cannot measure physical depth without stereoscopic LiDAR sensors.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-slate-100 border border-slate-200 text-left max-w-md mx-auto text-xs space-y-1">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-slate-500" />
                <span className="font-bold text-slate-800">Manual Citizen Grievance</span>
              </div>
              <p className="text-slate-600">
                Filed as a citizen-submitted complaint. Real AI inference was unavailable at submission time; no artificial scores were fabricated.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
            <Button
              variant="outline"
              size="md"
              onClick={handleResetForAnother}
              leftIcon={<ArrowLeft className="h-4 w-4" />}
            >
              Report Another Pothole
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => navigate('/reports')}
            >
              View in Grievance Ledger
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Page Title */}
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Civic Intake Form
            </span>
          </div>
          {isLiveSync ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
              <Database className="h-3.5 w-3.5 text-emerald-600" /> Live Supabase Mode
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
              <Info className="h-3.5 w-3.5 text-amber-600" /> Demo Session Mode
            </span>
          )}
        </div>
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5">
          Submit Road Defect Report
        </h1>
        <p className="text-xs sm:text-sm text-slate-500">
          Upload road imagery for automated YOLOv8 defect detection and lodge your grievance with the municipal authority.
        </p>
      </div>

      {submissionError && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">Persistence Operation Failed</p>
            <p>{submissionError}</p>
            <p className="text-[11px] text-red-600">
              No corrupted or incomplete report was committed. Storage objects were safely cleaned up.
            </p>
          </div>
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Step 1: Defect Imagery Upload */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>1. Defect Imagery & Real AI Detection</CardTitle>
              <span className="text-[11px] font-semibold text-slate-400 uppercase">
                Step 1 of 3
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <ImageUploader
              imageFile={imageFile}
              imagePreviewUrl={imagePreviewUrl}
              onImageSelected={handleImageSelected}
              detectionResult={detectionResult}
              isDetecting={isDetecting}
              detectionError={detectionError}
              onRetryDetection={handleRetryDetection}
            />
            {errors.image && (
              <p className="text-xs text-red-600 font-medium">{errors.image}</p>
            )}
          </CardContent>
        </Card>

        {/* Step 2: Location Details */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>2. Defect Coordinates & Location</CardTitle>
              <span className="text-[11px] font-semibold text-slate-400 uppercase">
                Step 2 of 3
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <LocationPicker
              latitude={latitude}
              longitude={longitude}
              roadName={roadName}
              selectedZone={zone}
              selectedWard={wardNumber}
              onLocationChange={handleLocationChange}
            />

            {(errors.latitude || errors.longitude) && (
              <p className="text-xs text-red-600 font-medium">
                {errors.latitude || errors.longitude}
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Road / Landmark Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Outer Ring Road, near Bellandur flyover"
                  value={roadName}
                  onChange={(e) => setRoadName(e.target.value)}
                  className="w-full text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-slate-900 focus:bg-white focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  BBMP Zone <span className="text-red-500">*</span>
                </label>
                <select
                  value={zone}
                  onChange={(e) => setZone(e.target.value as BBMPZone)}
                  className="w-full text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-slate-900 focus:bg-white focus:outline-none"
                >
                  {zones.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Step 3: Description & Reporter Details */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>3. Description & Reporter Contact</CardTitle>
              <span className="text-[11px] font-semibold text-slate-400 uppercase">
                Step 3 of 3
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Defect Description & Traffic Impact
              </label>
              <textarea
                rows={3}
                placeholder="Provide helpful context: crater width, waterlogging, proximity to school, etc."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-slate-900 focus:bg-white focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Severity / Priority Assessment
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as ReportPriority)}
                  className="w-full text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-slate-900 focus:bg-white focus:outline-none"
                >
                  <option value="critical">Critical (Arterial corridor hazard)</option>
                  <option value="high">High (Deep crater / two-wheeler risk)</option>
                  <option value="medium">Medium (Moderate road depression)</option>
                  <option value="low">Low (Surface erosion / minor wear)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Citizen Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Ramesh Kumar"
                  value={reporterName}
                  onChange={(e) => setReporterName(e.target.value)}
                  className="w-full text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-slate-900 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Citizen Contact / Email
                </label>
                <input
                  type="text"
                  placeholder="e.g. citizen@example.com"
                  value={reporterContact}
                  onChange={(e) => setReporterContact(e.target.value)}
                  className="w-full text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-slate-900 focus:bg-white focus:outline-none"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Submit Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
          <div className="text-xs text-slate-500">
            {submissionStage ? (
              <span className="flex items-center gap-1.5 font-medium text-slate-800 animate-pulse">
                <UploadCloud className="h-4 w-4 text-amber-500" />
                {submissionStage}
              </span>
            ) : (
              <span>
                Submission persists defect report to Supabase PostgreSQL and stores evidence photos.
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/')}
              className="w-full sm:w-auto text-xs"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting || isDetecting}
              leftIcon={
                isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
                ) : (
                  <Send className="h-4 w-4 text-amber-400" />
                )
              }
              className="w-full sm:w-auto font-bold text-sm shadow-sm"
            >
              {isSubmitting ? 'Persisting Report...' : 'Submit Defect Report'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
};
