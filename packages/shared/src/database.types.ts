export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      activities: {
        Row: {
          actor_id: string;
          created_at: string;
          id: string;
          log_id: string | null;
          target_user_id: string | null;
          type: string;
        };
        Insert: {
          actor_id: string;
          created_at?: string;
          id?: string;
          log_id?: string | null;
          target_user_id?: string | null;
          type: string;
        };
        Update: {
          actor_id?: string;
          created_at?: string;
          id?: string;
          log_id?: string | null;
          target_user_id?: string | null;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activities_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activities_log_id_fkey";
            columns: ["log_id"];
            isOneToOne: false;
            referencedRelation: "concert_logs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activities_target_user_id_fkey";
            columns: ["target_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      artists: {
        Row: {
          id: string;
          mbid: string | null;
          name: string;
          setlistfm_url: string | null;
        };
        Insert: {
          id?: string;
          mbid?: string | null;
          name: string;
          setlistfm_url?: string | null;
        };
        Update: {
          id?: string;
          mbid?: string | null;
          name?: string;
          setlistfm_url?: string | null;
        };
        Relationships: [];
      };
      concert_logs: {
        Row: {
          created_at: string;
          id: string;
          notes: string | null;
          rating_tenths: number | null;
          show_id: string;
          source: string;
          ticket_price_cents: number | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          notes?: string | null;
          rating_tenths?: number | null;
          show_id: string;
          source: string;
          ticket_price_cents?: number | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          notes?: string | null;
          rating_tenths?: number | null;
          show_id?: string;
          source?: string;
          ticket_price_cents?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "concert_logs_show_id_fkey";
            columns: ["show_id"];
            isOneToOne: false;
            referencedRelation: "shows";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "concert_logs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      follows: {
        Row: {
          accepted_at: string | null;
          created_at: string;
          followee_id: string;
          follower_id: string;
          status: string;
        };
        Insert: {
          accepted_at?: string | null;
          created_at?: string;
          followee_id: string;
          follower_id: string;
          status?: string;
        };
        Update: {
          accepted_at?: string | null;
          created_at?: string;
          followee_id?: string;
          follower_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "follows_followee_id_fkey";
            columns: ["followee_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "follows_follower_id_fkey";
            columns: ["follower_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      log_artists: {
        Row: {
          artist_id: string;
          log_id: string;
          position: number;
          setlistfm_url: string | null;
        };
        Insert: {
          artist_id: string;
          log_id: string;
          position: number;
          setlistfm_url?: string | null;
        };
        Update: {
          artist_id?: string;
          log_id?: string;
          position?: number;
          setlistfm_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "log_artists_artist_id_fkey";
            columns: ["artist_id"];
            isOneToOne: false;
            referencedRelation: "artists";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "log_artists_log_id_fkey";
            columns: ["log_id"];
            isOneToOne: false;
            referencedRelation: "concert_logs";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string;
          id: string;
          is_private: boolean;
          username: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name: string;
          id: string;
          is_private?: boolean;
          username: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string;
          id?: string;
          is_private?: boolean;
          username?: string;
        };
        Relationships: [];
      };
      shows: {
        Row: {
          date: string;
          festival_day_label: string | null;
          festival_name: string | null;
          id: string;
          setlistfm_url: string | null;
          venue_id: string;
        };
        Insert: {
          date: string;
          festival_day_label?: string | null;
          festival_name?: string | null;
          id?: string;
          setlistfm_url?: string | null;
          venue_id: string;
        };
        Update: {
          date?: string;
          festival_day_label?: string | null;
          festival_name?: string | null;
          id?: string;
          setlistfm_url?: string | null;
          venue_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shows_venue_id_fkey";
            columns: ["venue_id"];
            isOneToOne: false;
            referencedRelation: "venues";
            referencedColumns: ["id"];
          },
        ];
      };
      venues: {
        Row: {
          city: string;
          id: string;
          name: string;
          setlistfm_venue_id: string | null;
          state: string;
        };
        Insert: {
          city: string;
          id?: string;
          name: string;
          setlistfm_venue_id?: string | null;
          state: string;
        };
        Update: {
          city?: string;
          id?: string;
          name?: string;
          setlistfm_venue_id?: string | null;
          state?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      also_here: {
        Args: { p_log_id: string };
        Returns: {
          avatar_url: string;
          display_name: string;
          user_id: string;
          username: string;
        }[];
      };
      can_view: { Args: { owner_id: string; viewer_id: string }; Returns: boolean };
      delete_account: { Args: Record<PropertyKey, never>; Returns: undefined };
      feed: {
        Args: { p_before_created_at?: string; p_before_id?: string; p_limit?: number };
        Returns: {
          actor_avatar_url: string;
          actor_display_name: string;
          actor_id: string;
          actor_username: string;
          artist_count: number;
          city: string;
          created_at: string;
          festival_day_label: string;
          festival_name: string;
          headliner: string;
          id: string;
          log_id: string;
          rating_tenths: number;
          show_date: string;
          state: string;
          target_display_name: string;
          target_id: string;
          target_username: string;
          type: string;
          venue_name: string;
        }[];
      };
      follow_list: {
        Args: { p_kind: string; p_user_id: string };
        Returns: {
          avatar_url: string;
          display_name: string;
          follow_status: string;
          id: string;
          is_private: boolean;
          username: string;
        }[];
      };
      follow_requests: {
        Args: Record<PropertyKey, never>;
        Returns: {
          avatar_url: string;
          display_name: string;
          id: string;
          requested_at: string;
          username: string;
        }[];
      };
      is_username_available: { Args: { name: string }; Returns: boolean };
      leaderboard: {
        Args: { p_kind: string; p_user_id: string };
        Returns: {
          city: string;
          concerts: number;
          item_id: string;
          name: string;
          state: string;
        }[];
      };
      log_concert: {
        Args: {
          p_artists: Json;
          p_date: string;
          p_festival_day_label?: string;
          p_festival_name?: string;
          p_notes?: string;
          p_rating_tenths?: number;
          p_setlistfm_url?: string;
          p_source: string;
          p_ticket_price_cents?: number;
          p_venue: Json;
        };
        Returns: string;
      };
      log_filter_options: {
        Args: { p_user_id: string };
        Returns: {
          states: string[];
          years: number[];
        }[];
      };
      my_follow_status: { Args: { p_user_id: string }; Returns: string };
      profile_overview: {
        Args: { p_username: string };
        Returns: {
          avatar_url: string;
          can_view: boolean;
          concerts: number;
          display_name: string;
          follow_status: string;
          followers: number;
          following: number;
          follows_viewer: boolean;
          id: string;
          is_private: boolean;
          is_self: boolean;
          username: string;
        }[];
      };
      search_people: {
        Args: { p_query: string };
        Returns: {
          avatar_url: string;
          display_name: string;
          follow_status: string;
          id: string;
          is_private: boolean;
          username: string;
        }[];
      };
      stats_by_year: {
        Args: { p_user_id: string };
        Returns: {
          concerts: number;
          priced_concerts: number;
          spent_cents: number;
          year: number;
        }[];
      };
      update_log: {
        Args: {
          p_artists: Json;
          p_log_id: string;
          p_notes: string;
          p_rating_tenths: number;
          p_ticket_price_cents: number;
        };
        Returns: undefined;
      };
      user_log: {
        Args: {
          p_artist?: string;
          p_artist_id?: string;
          p_city?: string;
          p_limit?: number;
          p_month?: number;
          p_offset?: number;
          p_state?: string;
          p_user_id: string;
          p_venue_id?: string;
          p_year?: number;
        };
        Returns: {
          artists: string[];
          city: string;
          festival_day_label: string;
          festival_name: string;
          log_id: string;
          rating_tenths: number;
          show_date: string;
          state: string;
          total_count: number;
          venue_id: string;
          venue_name: string;
        }[];
      };
      user_stats: {
        Args: { p_user_id: string };
        Returns: {
          artists: number;
          cities: number;
          concerts: number;
          first_show: string;
          priced_concerts: number;
          spent_cents: number;
          states: number;
          venues: number;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
