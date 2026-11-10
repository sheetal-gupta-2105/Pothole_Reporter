import { getSupabaseClient, supabase, SUPABASE_TABLES } from '../lib/supabase';
import type { DatabaseReportRow, DatabaseReportInsert } from '../types/database';
import type {
  PotholeReport,
  ReportStatus,
  ReportPriority,
  BBMPZone,
  BoundingBox,
  RealAIDetection,
} from '../types/report';
import {
  uploadReportImages,
  rollbackUploadedImages,
  getReportSignedUrls,
} from './storage';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

async function mutateReport(reportId: string, payload?: { status?: ReportStatus; priority?: ReportPriority }): Promise<void> {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw new Error(`Unable to retrieve your authentication session: ${error.message}`);

  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('You must be signed in to update or delete a report. Please sign in again.');

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/reports/${encodeURIComponent(reportId)}`, {
      method: payload ? 'PATCH' : 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(payload ? { 'Content-Type': 'application/json' } : {}),
        Accept: 'application/json',
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Unable to connect to the report service. Please check your connection and try again.');
    }
    throw error;
  }

  if (response.ok) return;

  let detail = '';
  try {
    const body = await response.json();
    detail = typeof body?.detail === 'string' ? body.detail : '';
  } catch {
    // Some errors may not include a JSON response body.
  }
  const messages: Record<number, string> = {
    401: 'Your session is invalid or expired. Please sign in again.',
    403: 'You do not have permission to modify this report.',
    404: 'This report could not be found. It may have already been removed.',
  };
  const message = messages[response.status] || `Report service request failed (HTTP ${response.status}).`;
  throw new Error(detail ? `${message} ${detail}` : message);
}

/**
 * Maps a PostgreSQL reports table row to the frontend domain PotholeReport model.
 */
export function mapDbRowToPotholeReport(
  row: DatabaseReportRow,
  signedUrls?: { originalUrl?: string; annotatedUrl?: string }
): PotholeReport {
  const aiTelemetry = (row.ai_detection as Record<string, unknown>) || {};

  // Extract or fallback zone and ward
  const zone = (aiTelemetry.zone as BBMPZone) || 'Mahadevapura';
  const wardNumber = Number(aiTelemetry.ward_number) || 150;
  const reporterName = (aiTelemetry.reporter_name as string) || 'Citizen Reporter';
  const reporterContact = (aiTelemetry.reporter_contact as string) || '+91 Unspecified';

  // Normalize status
  const normalizedStatus: ReportStatus =
    row.status === 'pending'
      ? 'submitted'
      : (['submitted', 'in_review', 'verified', 'scheduled', 'resolved', 'rejected'].includes(
          row.status
        )
      ? (row.status as ReportStatus)
      : 'submitted');

  // Normalize priority
  const normalizedPriority: ReportPriority = ['low', 'medium', 'high', 'critical'].includes(
    row.priority
  )
    ? (row.priority as ReportPriority)
    : 'medium';

  // Extract Real AI Detection metadata if present
  let realAiDetection: RealAIDetection | undefined = undefined;
  if (row.pothole_count > 0 || aiTelemetry.model_name || aiTelemetry.detections) {
    realAiDetection = {
      isRealInference: true,
      potholesDetected: row.pothole_count,
      detections: (aiTelemetry.detections as BoundingBox[]) || [],
      annotatedImageUrl: signedUrls?.annotatedUrl || undefined,
      imageWidth: Number(aiTelemetry.image_width) || 800,
      imageHeight: Number(aiTelemetry.image_height) || 600,
      inferenceTimeMs: Number(aiTelemetry.inference_time_ms) || 0,
      modelName: (aiTelemetry.model_name as string) || 'best.pt',
      highestConfidence: Number(aiTelemetry.highest_confidence) || 0,
      suggestedPriority: (aiTelemetry.suggested_priority as ReportPriority) || normalizedPriority,
      notice:
        (aiTelemetry.notice as string) ||
        'Depth is not estimated: Single RGB imagery cannot measure physical depth without stereoscopic sensors.',
    };
  }

  return {
    id: row.id,
    roadName: row.title || row.address || 'Bengaluru Road Corridor',
    zone,
    wardNumber,
    description: row.description || '',
    status: normalizedStatus,
    priority: normalizedPriority,
    latitude: row.latitude,
    longitude: row.longitude,
    imageUrl:
      signedUrls?.originalUrl ||
      (row.image_path?.startsWith('http') ? row.image_path : '/samples/sample1.jpg'),
    reporterName,
    reporterContact,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    realAiDetection,
    userId: row.user_id,
    imagePath: row.image_path || undefined,
    annotatedImagePath: row.annotated_image_path || undefined,
    isLiveRecord: true,
    duplicateCount: 0,
  };
}

export interface CreateReportInput {
  userId: string;
  roadName: string;
  zone: BBMPZone;
  wardNumber: number;
  description: string;
  priority: ReportPriority;
  latitude: number;
  longitude: number;
  originalFile: File | Blob;
  reporterName: string;
  reporterContact: string;
  realAiDetection?: RealAIDetection;
}

/**
 * Creates a report in Supabase:
 * 1. Generates unique UUID.
 * 2. Uploads original and annotated photos to private Supabase storage.
 * 3. Inserts report row into public.reports.
 * 4. Rolls back storage objects if database insertion fails.
 * 5. Returns mapped PotholeReport with signed URLs.
 */
export async function createSupabaseReport(input: CreateReportInput): Promise<PotholeReport> {
  if (!supabase) {
    throw new Error('Supabase client is not configured.');
  }

  // 1. Generate unique UUID for the report
  const reportId = crypto.randomUUID();

  // 2. Upload photographs to private buckets
  const { originalPath, annotatedPath } = await uploadReportImages({
    userId: input.userId,
    reportId,
    originalFile: input.originalFile,
    annotatedBase64: input.realAiDetection?.annotatedImageUrl,
  });

  // 3. Prepare Database Row Payload
  const insertPayload: DatabaseReportInsert = {
    id: reportId,
    user_id: input.userId,
    title: input.roadName,
    description: input.description,
    latitude: input.latitude,
    longitude: input.longitude,
    address: `${input.roadName}, ${input.zone} (Ward ${input.wardNumber})`,
    status: 'submitted',
    priority: input.priority,
    pothole_count: input.realAiDetection?.potholesDetected ?? 0,
    image_path: originalPath,
    annotated_image_path: annotatedPath,
    ai_detection: {
      zone: input.zone,
      ward_number: input.wardNumber,
      reporter_name: input.reporterName,
      reporter_contact: input.reporterContact,
      model_name: input.realAiDetection?.modelName || 'best.pt',
      potholes_detected: input.realAiDetection?.potholesDetected ?? 0,
      highest_confidence: input.realAiDetection?.highestConfidence ?? 0,
      inference_time_ms: input.realAiDetection?.inferenceTimeMs ?? 0,
      suggested_priority: input.realAiDetection?.suggestedPriority ?? input.priority,
      detections: input.realAiDetection?.detections || [],
      notice: input.realAiDetection?.notice || 'Verified via YOLOv8 detection backend',
      image_width: input.realAiDetection?.imageWidth || 800,
      image_height: input.realAiDetection?.imageHeight || 600,
    },
  };

  // 4. Insert row with rollback on error
  try {
    const { data, error } = await supabase
      .from(SUPABASE_TABLES.REPORTS)
      .insert(insertPayload)
      .select()
      .single();

    if (error || !data) {
      throw new Error(error?.message || 'Failed to insert report into database');
    }

    // 5. Generate signed URLs for immediate display
    const signedUrls = await getReportSignedUrls(originalPath, annotatedPath);
    return mapDbRowToPotholeReport(data, signedUrls);
  } catch (err) {
    // Clean up uploaded storage objects to avoid orphaned files
    await rollbackUploadedImages({ originalPath, annotatedPath });
    throw err;
  }
}

/**
 * Fetches all reports from public.reports with signed URLs.
 * Set forceRefresh = true to bypass the in-memory signed URL cache.
 */
export async function fetchSupabaseReports(forceRefresh = false): Promise<PotholeReport[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from(SUPABASE_TABLES.REPORTS)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to load reports from Supabase: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return [];
  }

  // Generate signed URLs in parallel
  const reports = await Promise.all(
    data.map(async (row) => {
      const signedUrls = await getReportSignedUrls(
        row.image_path,
        row.annotated_image_path,
        3600,
        forceRefresh
      );
      return mapDbRowToPotholeReport(row, signedUrls);
    })
  );

  return reports;
}

/**
 * Updates a report's status through the authenticated backend.
 */
export async function updateSupabaseReportStatus(
  reportId: string,
  newStatus: ReportStatus
): Promise<void> {
  await mutateReport(reportId, { status: newStatus });
}

/**
 * Updates a report's priority through the authenticated backend.
 */
export async function updateSupabaseReportPriority(
  reportId: string,
  newPriority: ReportPriority
): Promise<void> {
  await mutateReport(reportId, { priority: newPriority });
}

/**
 * Deletes a report through the authenticated backend, which also cleans up its storage objects.
 */
export async function deleteSupabaseReport(report: PotholeReport): Promise<void> {
  await mutateReport(report.id);
}
