export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      portfolio_settings: {
        Row: {
          created_at: string
          id: string
          settings: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          settings?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          settings?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      portfolio_summary: {
        Row: {
          cash_balance: number | null
          created_at: string
          id: string
          last_import_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cash_balance?: number | null
          created_at?: string
          id?: string
          last_import_date?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cash_balance?: number | null
          created_at?: string
          id?: string
          last_import_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      positions: {
        Row: {
          account: Json | null
          category: Database["public"]["Enums"]["position_category"] | null
          company_name: string | null
          cost_basis: number | null
          created_at: string
          current_price: number | null
          current_value: number | null
          date_added: string | null
          first_seen_at: string | null
          id: string
          last_price_update: string | null
          notes: string | null
          shares: number | null
          source: string | null
          symbol: string
          tier: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account?: Json | null
          category?: Database["public"]["Enums"]["position_category"] | null
          company_name?: string | null
          cost_basis?: number | null
          created_at?: string
          current_price?: number | null
          current_value?: number | null
          date_added?: string | null
          first_seen_at?: string | null
          id?: string
          last_price_update?: string | null
          notes?: string | null
          shares?: number | null
          source?: string | null
          symbol: string
          tier?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account?: Json | null
          category?: Database["public"]["Enums"]["position_category"] | null
          company_name?: string | null
          cost_basis?: number | null
          created_at?: string
          current_price?: number | null
          current_value?: number | null
          date_added?: string | null
          first_seen_at?: string | null
          id?: string
          last_price_update?: string | null
          notes?: string | null
          shares?: number | null
          source?: string | null
          symbol?: string
          tier?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      price_alerts: {
        Row: {
          acknowledged_at: string | null
          alert_type: Database["public"]["Enums"]["alert_type"]
          created_at: string
          id: string
          is_active: boolean
          last_notified_at: string | null
          notification_sent: boolean
          notify_time: string | null
          reference_price: number | null
          symbol: string
          target_value: number
          triggered_at: string | null
          user_id: string
          watchlist_entry_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          alert_type: Database["public"]["Enums"]["alert_type"]
          created_at?: string
          id?: string
          is_active?: boolean
          last_notified_at?: string | null
          notification_sent?: boolean
          notify_time?: string | null
          reference_price?: number | null
          symbol: string
          target_value: number
          triggered_at?: string | null
          user_id: string
          watchlist_entry_id: string
        }
        Update: {
          acknowledged_at?: string | null
          alert_type?: Database["public"]["Enums"]["alert_type"]
          created_at?: string
          id?: string
          is_active?: boolean
          last_notified_at?: string | null
          notification_sent?: boolean
          notify_time?: string | null
          reference_price?: number | null
          symbol?: string
          target_value?: number
          triggered_at?: string | null
          user_id?: string
          watchlist_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_alerts_watchlist_entry_id_fkey"
            columns: ["watchlist_entry_id"]
            isOneToOne: false
            referencedRelation: "watchlist_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      screen_runs: {
        Row: {
          all_symbols: string[]
          auto_tag_code: string | null
          auto_tag_id: string | null
          created_at: string
          id: string
          match_count: number
          matched_symbols: string[] | null
          run_date: string
          run_number: number
          screen_id: string
          total_symbols: number
          user_id: string
        }
        Insert: {
          all_symbols?: string[]
          auto_tag_code?: string | null
          auto_tag_id?: string | null
          created_at?: string
          id?: string
          match_count?: number
          matched_symbols?: string[] | null
          run_date?: string
          run_number?: number
          screen_id: string
          total_symbols?: number
          user_id: string
        }
        Update: {
          all_symbols?: string[]
          auto_tag_code?: string | null
          auto_tag_id?: string | null
          created_at?: string
          id?: string
          match_count?: number
          matched_symbols?: string[] | null
          run_date?: string
          run_number?: number
          screen_id?: string
          total_symbols?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "screen_runs_auto_tag_id_fkey"
            columns: ["auto_tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screen_runs_screen_id_fkey"
            columns: ["screen_id"]
            isOneToOne: false
            referencedRelation: "screens"
            referencedColumns: ["id"]
          },
        ]
      }
      screens: {
        Row: {
          created_at: string
          id: string
          name: string
          short_code: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          short_code: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          short_code?: string
          user_id?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string | null
          created_at: string
          full_name: string | null
          id: string
          is_active: boolean
          is_system_tag: boolean
          screen_date: string | null
          screen_id: string | null
          screen_name: string | null
          short_code: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          is_system_tag?: boolean
          screen_date?: string | null
          screen_id?: string | null
          screen_name?: string | null
          short_code: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          is_system_tag?: boolean
          screen_date?: string | null
          screen_id?: string | null
          screen_name?: string | null
          short_code?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      watchlist_entries: {
        Row: {
          company_name: string | null
          created_at: string
          current_price: number | null
          date_added: string
          id: string
          industry: string | null
          last_price_update: string | null
          market_cap: number | null
          market_cap_category: string | null
          notes: string | null
          previous_close: number | null
          price_when_added: number | null
          sector: string | null
          symbol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          current_price?: number | null
          date_added?: string
          id?: string
          industry?: string | null
          last_price_update?: string | null
          market_cap?: number | null
          market_cap_category?: string | null
          notes?: string | null
          previous_close?: number | null
          price_when_added?: number | null
          sector?: string | null
          symbol: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          current_price?: number | null
          date_added?: string
          id?: string
          industry?: string | null
          last_price_update?: string | null
          market_cap?: number | null
          market_cap_category?: string | null
          notes?: string | null
          previous_close?: number | null
          price_when_added?: number | null
          sector?: string | null
          symbol?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      watchlist_entry_tags: {
        Row: {
          assigned_at: string
          tag_id: string
          watchlist_entry_id: string
        }
        Insert: {
          assigned_at?: string
          tag_id: string
          watchlist_entry_id: string
        }
        Update: {
          assigned_at?: string
          tag_id?: string
          watchlist_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_entry_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watchlist_entry_tags_watchlist_entry_id_fkey"
            columns: ["watchlist_entry_id"]
            isOneToOne: false
            referencedRelation: "watchlist_entries"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      alert_type:
        | "PRICE_ABOVE"
        | "PRICE_BELOW"
        | "PCT_CHANGE_UP"
        | "PCT_CHANGE_DOWN"
      position_category: "CORE" | "TITAN" | "CONSENSUS"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      alert_type: [
        "PRICE_ABOVE",
        "PRICE_BELOW",
        "PCT_CHANGE_UP",
        "PCT_CHANGE_DOWN",
      ],
      position_category: ["CORE", "TITAN", "CONSENSUS"],
    },
  },
} as const
