import type { BBMPZone, ReportPriority, ReportStatus, BoundingBox } from './report';

/**
 * Supabase PostgreSQL Database Schema Types for Pothole Reporter
 * Table: public.reports
 */
export interface DatabaseReportRow {
  id: string;
  created_at: string;
  updated_at: string;
  road_name: string;
  zone: BBMPZone;
  ward_number: number;
  description: string;
  status: ReportStatus;
  priority: ReportPriority;
  latitude: number;
  longitude: number;
  image_url: string;
  annotated_image_url?: string | null;
  reporter_name: string;
  reporter_contact: string;
  user_id?: string | null; // Citizen user ID from Supabase auth.users (RLS owner)
  potholes_detected?: number | null;
  highest_confidence?: number | null;
  inference_time_ms?: number | null;
  model_name?: string | null;
  detections?: BoundingBox[] | null;
  duplicate_of_id?: string | null;
  duplicate_count?: number | null;
}

export interface Database {
  public: {
    Tables: {
      reports: {
        Row: DatabaseReportRow;
        Insert: Omit<DatabaseReportRow, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<DatabaseReportRow>;
      };
    };
  };
}
