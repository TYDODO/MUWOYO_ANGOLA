import type { Database, Json } from "./types";

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type AppDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables"> & {
    Tables: Database["public"]["Tables"] & {
      business_audit_log: Table<{
        id: string;
        business_id: string;
        actor_user_id: string;
        action: string;
        target_user_id: string | null;
        conversation_id: string | null;
        metadata: Json;
        created_at: string;
      }, {
        id?: string;
        business_id: string;
        actor_user_id: string;
        action: string;
        target_user_id?: string | null;
        conversation_id?: string | null;
        metadata?: Json;
        created_at?: string;
      }>;
      business_member_presence: Table<{
        user_id: string;
        business_id: string;
        is_online: boolean;
        last_seen_at: string;
      }, {
        user_id: string;
        business_id: string;
        is_online?: boolean;
        last_seen_at?: string;
      }>;
      tutorial_videos: Table<{
        id: string;
        title: string;
        subtitle: string | null;
        description: string | null;
        video_url: string;
        cover_url: string | null;
        position: number;
        is_published: boolean;
        is_intro_video: boolean;
        created_at: string;
        updated_at: string;
      }, {
        id?: string;
        title: string;
        subtitle?: string | null;
        description?: string | null;
        video_url: string;
        cover_url?: string | null;
        position?: number;
        is_published?: boolean;
        is_intro_video?: boolean;
        created_at?: string;
        updated_at?: string;
      }>;
    };
    Functions: Database["public"]["Functions"] & {
      get_attendant_message_stats: {
        Args: { p_business_id: string };
        Returns: {
          attendant_user_id: string;
          assigned_messages: number;
          answered_messages: number;
          unanswered_messages: number;
        }[];
      };
    };
  };
};
