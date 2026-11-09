export type ReportStatus =
  | 'submitted'
  | 'in_review'
  | 'verified'
  | 'scheduled'
  | 'resolved'
  | 'rejected';

export type ReportPriority = 'low' | 'medium' | 'high' | 'critical';

export type BBMPZone =
  | 'Mahadevapura'
  | 'Bommanahalli'
  | 'East Zone'
  | 'West Zone'
  | 'South Zone'
  | 'Rajarajeshwari Nagar'
  | 'Yelahanka'
  | 'Dasarahalli';

export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  confidence: number;
  class_id: number;
  class_name: string;
}

export interface RealAIDetection {
  isRealInference: true;
  potholesDetected: number;
  detections: BoundingBox[];
  annotatedImageUrl?: string;
  imageWidth: number;
  imageHeight: number;
  inferenceTimeMs: number;
  modelName: string;
  highestConfidence: number; // 0.0 - 1.0
  suggestedPriority: ReportPriority;
  notice: string;
}

export interface SimulatedAIDetection {
  isRealInference?: false;
  potholeDetected: boolean;
  confidenceScore: number; // 0 - 100
  estimatedSeverity: ReportPriority;
  estimatedDepthCm?: number;
  estimatedSurfaceAreaSqM?: number;
  detectedFeatures: string[];
}

export interface PotholeReport {
  id: string;
  roadName: string;
  zone: BBMPZone;
  wardNumber: number;
  description: string;
  status: ReportStatus;
  priority: ReportPriority;
  latitude: number;
  longitude: number;
  imageUrl: string;
  reporterName: string;
  reporterContact: string;
  createdAt: string;
  updatedAt: string;
  simulatedAiDetection?: SimulatedAIDetection;
  realAiDetection?: RealAIDetection;
  duplicateOfId?: string; // If merged into another report
  duplicateCount?: number;
  userId?: string; // Authenticated citizen Supabase UUID
  imagePath?: string; // Storage path in pothole-originals
  annotatedImagePath?: string; // Storage path in pothole-annotated
  isLiveRecord?: boolean; // Whether the record is persisted in Supabase
}

export interface DuplicatePair {
  id: string;
  primaryReportId: string;
  incomingReportId: string;
  distanceMeters: number;
  simulatedVisualSimilarity: number; // 0 - 100 (%)
  clusterConfidence: number; // 0 - 100 (%)
  status: 'pending' | 'confirmed' | 'rejected';
  reviewedAt?: string;
  reviewNotes?: string;
}

export interface FilterOptions {
  search: string;
  status: 'all' | ReportStatus;
  priority: 'all' | ReportPriority;
  zone: 'all' | BBMPZone;
  sortBy: 'newest' | 'oldest' | 'priority' | 'severity';
}
