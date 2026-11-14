import { getSupabaseClient } from '../lib/supabase';
import type { DuplicatePair } from '../types/report';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export interface ApiDuplicateCandidate {
  id: string;
  primary_report_id: string;
  incoming_report_id: string;
  distance_meters: number;
  hamming_distance: number | null;
  similarity_pct: number | null;
  classification: 'strong_duplicate' | 'possible_duplicate';
  reason: string;
  status: 'pending' | 'confirmed' | 'rejected';
  reviewed_at: string | null;
  created_at: string | null;
  primary_report?: {
    id: string;
    user_id: string;
    title?: string | null;
    [key: string]: unknown;
  } | null;
  incoming_report?: {
    id: string;
    user_id: string;
    title?: string | null;
    [key: string]: unknown;
  } | null;
}

function mapApiCandidateToDuplicatePair(c: ApiDuplicateCandidate): DuplicatePair {
  const sim = c.similarity_pct ?? (c.hamming_distance !== null ? Math.max(0, (64 - c.hamming_distance) / 64 * 100) : 75.0);
  const clusterConf = Math.round((sim + Math.max(0, 100 - c.distance_meters)) / 2);

  return {
    id: c.id,
    primaryReportId: c.primary_report_id,
    incomingReportId: c.incoming_report_id,
    distanceMeters: c.distance_meters,
    simulatedVisualSimilarity: sim,
    clusterConfidence: clusterConf,
    status: c.status,
    classification: c.classification,
    reason: c.reason,
    hammingDistance: c.hamming_distance ?? undefined,
    reviewedAt: c.reviewed_at ?? undefined,
    isLiveRecord: true,
    primaryReportUserId: c.primary_report?.user_id,
    incomingReportUserId: c.incoming_report?.user_id,
  };
}

async function getAuthHeader(): Promise<string> {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error('You must be signed in to access duplicate detection services.');
  }
  return `Bearer ${data.session.access_token}`;
}

/**
 * Fetches all duplicate candidates from the backend deduplication service.
 */
export async function fetchDuplicateCandidates(status?: string): Promise<DuplicatePair[]> {
  const authHeader = await getAuthHeader();
  const query = status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';

  const response = await fetch(`${API_BASE_URL}/api/duplicates${query}`, {
    headers: {
      Authorization: authHeader,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    let detail = '';
    try {
      const errBody = await response.json();
      detail = errBody?.detail || '';
    } catch {
      // ignore json parse error
    }
    throw new Error(detail || `Failed to fetch duplicate candidates (HTTP ${response.status}).`);
  }

  const data: ApiDuplicateCandidate[] = await response.json();
  return data.map(mapApiCandidateToDuplicatePair);
}

/**
 * Reviews a duplicate candidate pair (confirm or reject) with citizen ownership verification.
 */
export async function reviewDuplicateCandidate(
  candidateId: string,
  newStatus: 'confirmed' | 'rejected',
  notes?: string
): Promise<DuplicatePair> {
  const authHeader = await getAuthHeader();

  const response = await fetch(`${API_BASE_URL}/api/duplicates/${encodeURIComponent(candidateId)}`, {
    method: 'PATCH',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      status: newStatus,
      review_notes: notes || undefined,
    }),
  });

  if (!response.ok) {
    let detail = '';
    try {
      const errBody = await response.json();
      detail = errBody?.detail || '';
    } catch {
      // ignore
    }
    if (response.status === 403) {
      throw new Error(detail || 'You can only review duplicate candidates for reports that you submitted.');
    }
    throw new Error(detail || `Failed to update duplicate review (HTTP ${response.status}).`);
  }

  const updated: ApiDuplicateCandidate = await response.json();
  return mapApiCandidateToDuplicatePair(updated);
}

/**
 * Triggers backend spatial and perceptual duplicate detection for a freshly submitted report.
 */
export async function triggerReportDuplicateCheck(reportId: string): Promise<DuplicatePair[]> {
  const authHeader = await getAuthHeader();

  const response = await fetch(`${API_BASE_URL}/api/reports/${encodeURIComponent(reportId)}/check-duplicates`, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    let detail = '';
    try {
      const errBody = await response.json();
      detail = errBody?.detail || '';
    } catch {
      // ignore
    }
    throw new Error(detail || `Duplicate check request failed (HTTP ${response.status}).`);
  }

  const data = await response.json();
  const candidates: ApiDuplicateCandidate[] = data.candidates || [];
  return candidates.map(mapApiCandidateToDuplicatePair);
}
