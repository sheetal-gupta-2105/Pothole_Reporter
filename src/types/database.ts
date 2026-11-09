export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]
  | Record<string, unknown>
  | unknown[];

export type Database = {
  public: {
    Tables: {
      reports: {
        Row: {
          id: string;
          user_id: string;
          title: string | null;
          description: string | null;
          latitude: number;
          longitude: number;
          address: string | null;
          status: string;
          priority: string;
          pothole_count: number;
          ai_detection: Json | null;
          image_path: string | null;
          annotated_image_path: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title?: string | null;
          description?: string | null;
          latitude: number;
          longitude: number;
          address?: string | null;
          status?: string;
          priority?: string;
          pothole_count?: number;
          ai_detection?: Json | null;
          image_path?: string | null;
          annotated_image_path?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string | null;
          description?: string | null;
          latitude?: number;
          longitude?: number;
          address?: string | null;
          status?: string;
          priority?: string;
          pothole_count?: number;
          ai_detection?: Json | null;
          image_path?: string | null;
          annotated_image_path?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: string;
            columns: string[];
            isOneToOne?: boolean;
            referencedRelation: string;
            referencedColumns: string[];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export type DatabaseReportRow = Database['public']['Tables']['reports']['Row'];
export type DatabaseReportInsert = Database['public']['Tables']['reports']['Insert'];
export type DatabaseReportUpdate = Database['public']['Tables']['reports']['Update'];
