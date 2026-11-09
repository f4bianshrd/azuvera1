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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          is_public: boolean
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          is_public?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          is_public?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: Database["public"]["Enums"]["app_role"] | null
          azubi_id: string | null
          chain_key: string
          created_at: string
          details: Json
          entity_id: string | null
          entity_type: string
          id: number
          prev_hash: string | null
          row_hash: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          azubi_id?: string | null
          chain_key?: string
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type: string
          id?: never
          prev_hash?: string | null
          row_hash?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          azubi_id?: string | null
          chain_key?: string
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string
          id?: never
          prev_hash?: string | null
          row_hash?: string | null
        }
        Relationships: []
      }
      azubi_viewers: {
        Row: {
          azubi_id: string
          created_at: string
          created_by: string | null
          viewer_id: string
        }
        Insert: {
          azubi_id: string
          created_at?: string
          created_by?: string | null
          viewer_id: string
        }
        Update: {
          azubi_id?: string
          created_at?: string
          created_by?: string | null
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "azubi_viewers_azubi_id_fkey"
            columns: ["azubi_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "azubi_viewers_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          chamber: string | null
          contact_email: string | null
          contact_person: string | null
          contact_phone: string | null
          created_at: string
          id: string
          legal_form: string | null
          logo_url: string | null
          name: string
          training_number: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          chamber?: string | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          legal_form?: string | null
          logo_url?: string | null
          name: string
          training_number?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          chamber?: string | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          legal_form?: string | null
          logo_url?: string | null
          name?: string
          training_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      company_professions: {
        Row: {
          company_id: string
          created_at: string
          profession_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          profession_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          profession_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_professions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_professions_profession_id_fkey"
            columns: ["profession_id"]
            isOneToOne: false
            referencedRelation: "professions"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          note: string | null
          role: Database["public"]["Enums"]["app_role"]
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          note?: string | null
          role: Database["public"]["Enums"]["app_role"]
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          note?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          link: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      professions: {
        Row: {
          chamber: string | null
          code: string | null
          created_at: string
          description: string | null
          duration_months: number
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          chamber?: string | null
          code?: string | null
          created_at?: string
          description?: string | null
          duration_months?: number
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          chamber?: string | null
          code?: string | null
          created_at?: string
          description?: string | null
          duration_months?: number
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ausbilder_id: string | null
          ausbildungsbeginn: string | null
          ausbildungsende: string | null
          company_id: string | null
          created_at: string
          email: string
          full_name: string
          geburtsdatum: string | null
          id: string
          land: string
          nachname: string
          notfallkontakt_name: string | null
          notfallkontakt_telefon: string | null
          ort: string | null
          personalnummer: string | null
          plz: string | null
          profession_id: string | null
          strasse: string | null
          telefon: string | null
          updated_at: string
          vorname: string
        }
        Insert: {
          ausbilder_id?: string | null
          ausbildungsbeginn?: string | null
          ausbildungsende?: string | null
          company_id?: string | null
          created_at?: string
          email?: string
          full_name?: string
          geburtsdatum?: string | null
          id: string
          land?: string
          nachname?: string
          notfallkontakt_name?: string | null
          notfallkontakt_telefon?: string | null
          ort?: string | null
          personalnummer?: string | null
          plz?: string | null
          profession_id?: string | null
          strasse?: string | null
          telefon?: string | null
          updated_at?: string
          vorname?: string
        }
        Update: {
          ausbilder_id?: string | null
          ausbildungsbeginn?: string | null
          ausbildungsende?: string | null
          company_id?: string | null
          created_at?: string
          email?: string
          full_name?: string
          geburtsdatum?: string | null
          id?: string
          land?: string
          nachname?: string
          notfallkontakt_name?: string | null
          notfallkontakt_telefon?: string | null
          ort?: string | null
          personalnummer?: string | null
          plz?: string | null
          profession_id?: string | null
          strasse?: string | null
          telefon?: string | null
          updated_at?: string
          vorname?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_ausbilder_fk"
            columns: ["ausbilder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_company_fk"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_profession_fk"
            columns: ["profession_id"]
            isOneToOne: false
            referencedRelation: "professions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_review_for: {
        Args: { _azubi: string; _reviewer: string }
        Returns: boolean
      }
      can_view_azubi: {
        Args: { _azubi: string; _viewer: string }
        Returns: boolean
      }
      display_names: {
        Args: { _ids: string[] }
        Returns: {
          full_name: string
          id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_leitung: { Args: { _user_id: string }; Returns: boolean }
      is_reviewer_role: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "azubi"
        | "ausbilder"
        | "betriebsleiter"
        | "ausbildungsberater"
        | "lehrer"
        | "ausbildungsleitung"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: [
        "azubi",
        "ausbilder",
        "betriebsleiter",
        "ausbildungsberater",
        "lehrer",
        "ausbildungsleitung",
      ],
    },
  },
} as const
