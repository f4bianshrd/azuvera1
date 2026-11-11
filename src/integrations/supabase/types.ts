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
      absences: {
        Row: {
          azubi_id: string
          created_at: string
          date_from: string
          date_to: string
          id: string
          note: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          status: Database["public"]["Enums"]["absence_status"]
          type: Database["public"]["Enums"]["absence_type"]
          updated_at: string
        }
        Insert: {
          azubi_id: string
          created_at?: string
          date_from: string
          date_to: string
          id?: string
          note?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["absence_status"]
          type: Database["public"]["Enums"]["absence_type"]
          updated_at?: string
        }
        Update: {
          azubi_id?: string
          created_at?: string
          date_from?: string
          date_to?: string
          id?: string
          note?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["absence_status"]
          type?: Database["public"]["Enums"]["absence_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "absences_azubi_id_fkey"
            columns: ["azubi_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absences_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage: {
        Row: {
          created_at: string
          duration_ms: number
          field: string
          id: string
          input_chars: number
          ok: boolean
          output_chars: number
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number
          field: string
          id?: string
          input_chars: number
          ok?: boolean
          output_chars?: number
          user_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number
          field?: string
          id?: string
          input_chars?: number
          ok?: boolean
          output_chars?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
      consents: {
        Row: {
          granted_at: string
          id: string
          kind: Database["public"]["Enums"]["consent_kind"]
          revoked_at: string | null
          text_version: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          id?: string
          kind: Database["public"]["Enums"]["consent_kind"]
          revoked_at?: string | null
          text_version: string
          user_id: string
        }
        Update: {
          granted_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["consent_kind"]
          revoked_at?: string | null
          text_version?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deputies: {
        Row: {
          created_at: string
          created_by: string | null
          date_from: string
          date_to: string
          deputy_id: string
          id: string
          note: string | null
          principal_id: string
          reason: string
          revoked_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date_from: string
          date_to: string
          deputy_id: string
          id?: string
          note?: string | null
          principal_id: string
          reason: string
          revoked_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date_from?: string
          date_to?: string
          deputy_id?: string
          id?: string
          note?: string | null
          principal_id?: string
          reason?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deputies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deputies_deputy_id_fkey"
            columns: ["deputy_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deputies_principal_id_fkey"
            columns: ["principal_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          ai_hints: string
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
          ai_hints?: string
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
          ai_hints?: string
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
      report_attachments: {
        Row: {
          azubi_id: string
          caption: string | null
          created_at: string
          file_name: string
          height: number | null
          id: string
          mime_type: string
          report_id: string
          sha256: string | null
          size_bytes: number
          sort_order: number
          storage_path: string
          thumb_path: string | null
          width: number | null
        }
        Insert: {
          azubi_id: string
          caption?: string | null
          created_at?: string
          file_name: string
          height?: number | null
          id?: string
          mime_type: string
          report_id: string
          sha256?: string | null
          size_bytes: number
          sort_order?: number
          storage_path: string
          thumb_path?: string | null
          width?: number | null
        }
        Update: {
          azubi_id?: string
          caption?: string | null
          created_at?: string
          file_name?: string
          height?: number | null
          id?: string
          mime_type?: string
          report_id?: string
          sha256?: string | null
          size_bytes?: number
          sort_order?: number
          storage_path?: string
          thumb_path?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "report_attachments_azubi_id_fkey"
            columns: ["azubi_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_attachments_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_comments: {
        Row: {
          author_id: string
          azubi_id: string
          body: string
          created_at: string
          id: string
          kind: string
          report_id: string
          section: string | null
        }
        Insert: {
          author_id?: string
          azubi_id: string
          body: string
          created_at?: string
          id?: string
          kind?: string
          report_id: string
          section?: string | null
        }
        Update: {
          author_id?: string
          azubi_id?: string
          body?: string
          created_at?: string
          id?: string
          kind?: string
          report_id?: string
          section?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_comments_azubi_id_fkey"
            columns: ["azubi_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_comments_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_reminders: {
        Row: {
          azubi_id: string
          channel: string
          created_at: string
          id: string
          message: string
          period_label: string
          sender_id: string | null
        }
        Insert: {
          azubi_id: string
          channel?: string
          created_at?: string
          id?: string
          message: string
          period_label: string
          sender_id?: string | null
        }
        Update: {
          azubi_id?: string
          channel?: string
          created_at?: string
          id?: string
          message?: string
          period_label?: string
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_reminders_azubi_id_fkey"
            columns: ["azubi_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_reminders_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      report_signatures: {
        Row: {
          client_signed_at: string | null
          content_hash: string | null
          id: string
          image_path: string | null
          method: string
          on_behalf_of: string | null
          report_id: string
          report_version: number
          role: string
          signed_at: string
          signer_id: string
          signer_name: string
          signer_role_label: string | null
        }
        Insert: {
          client_signed_at?: string | null
          content_hash?: string | null
          id?: string
          image_path?: string | null
          method: string
          on_behalf_of?: string | null
          report_id: string
          report_version: number
          role: string
          signed_at?: string
          signer_id: string
          signer_name: string
          signer_role_label?: string | null
        }
        Update: {
          client_signed_at?: string | null
          content_hash?: string | null
          id?: string
          image_path?: string | null
          method?: string
          on_behalf_of?: string | null
          report_id?: string
          report_version?: number
          role?: string
          signed_at?: string
          signer_id?: string
          signer_name?: string
          signer_role_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_signatures_on_behalf_of_fkey"
            columns: ["on_behalf_of"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_signatures_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_signatures_signer_id_fkey"
            columns: ["signer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      report_versions: {
        Row: {
          changed_by: string | null
          content_hash: string | null
          created_at: string
          id: string
          report_id: string
          snapshot: Json
          status: Database["public"]["Enums"]["report_status"]
          version: number
        }
        Insert: {
          changed_by?: string | null
          content_hash?: string | null
          created_at?: string
          id?: string
          report_id: string
          snapshot: Json
          status: Database["public"]["Enums"]["report_status"]
          version: number
        }
        Update: {
          changed_by?: string | null
          content_hash?: string | null
          created_at?: string
          id?: string
          report_id?: string
          snapshot?: Json
          status?: Database["public"]["Enums"]["report_status"]
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "report_versions_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          activities: string | null
          azubi_id: string
          content_hash: string | null
          created_at: string
          id: string
          instructions: string | null
          report_date: string
          report_type: Database["public"]["Enums"]["report_type"]
          review_note: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          school_content: string | null
          status: Database["public"]["Enums"]["report_status"]
          submitted_at: string | null
          summary: string | null
          updated_at: string
          version: number
          week_number: number | null
          weekly_mode: string
          year: number | null
        }
        Insert: {
          activities?: string | null
          azubi_id: string
          content_hash?: string | null
          created_at?: string
          id?: string
          instructions?: string | null
          report_date: string
          report_type: Database["public"]["Enums"]["report_type"]
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          school_content?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          submitted_at?: string | null
          summary?: string | null
          updated_at?: string
          version?: number
          week_number?: number | null
          weekly_mode?: string
          year?: number | null
        }
        Update: {
          activities?: string | null
          azubi_id?: string
          content_hash?: string | null
          created_at?: string
          id?: string
          instructions?: string | null
          report_date?: string
          report_type?: Database["public"]["Enums"]["report_type"]
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          school_content?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          submitted_at?: string | null
          summary?: string | null
          updated_at?: string
          version?: number
          week_number?: number | null
          weekly_mode?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_azubi_id_fkey"
            columns: ["azubi_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      school_grades: {
        Row: {
          azubi_id: string
          created_at: string
          grade: number
          grade_date: string
          id: string
          kind: Database["public"]["Enums"]["grade_kind"]
          note: string | null
          subject: string
          updated_at: string
        }
        Insert: {
          azubi_id: string
          created_at?: string
          grade: number
          grade_date: string
          id?: string
          kind?: Database["public"]["Enums"]["grade_kind"]
          note?: string | null
          subject: string
          updated_at?: string
        }
        Update: {
          azubi_id?: string
          created_at?: string
          grade?: number
          grade_date?: string
          id?: string
          kind?: Database["public"]["Enums"]["grade_kind"]
          note?: string | null
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_grades_azubi_id_fkey"
            columns: ["azubi_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      user_signatures: {
        Row: {
          image_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          image_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          image_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_signatures_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      absent_days: {
        Args: { _azubi: string; _from_date: string; _to_date: string }
        Returns: string[]
      }
      acting_principal: {
        Args: { _azubi: string; _reviewer: string }
        Returns: string
      }
      admin_list_users: {
        Args: never
        Returns: {
          ausbilder_id: string
          company_id: string
          created_at: string
          email: string
          full_name: string
          id: string
          profession_id: string
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      admin_set_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      admin_set_viewers: {
        Args: { _azubi_id: string; _viewer_ids: string[] }
        Returns: undefined
      }
      admin_update_azubi: {
        Args: { _azubi_id: string; _patch: Json }
        Returns: undefined
      }
      approve_report: {
        Args: {
          _client_signed_at?: string
          _expected_version: number
          _image_path?: string
          _method: string
          _note?: string
          _report_id: string
        }
        Returns: undefined
      }
      audit_hash: {
        Args: {
          _action: string
          _actor_id: string
          _created_at: string
          _details: Json
          _entity_id: string
          _entity_type: string
          _prev_hash: string
        }
        Returns: string
      }
      can_review_for: {
        Args: { _azubi: string; _reviewer: string }
        Returns: boolean
      }
      can_view_azubi: {
        Args: { _azubi: string; _viewer: string }
        Returns: boolean
      }
      compute_missing_weeks: {
        Args: { p_as_of: string; p_azubi: string }
        Returns: {
          azubi_id: string
          days_missing: number
          days_overdue: number
          week_end: string
          week_start: string
        }[]
      }
      create_invite_code: {
        Args: {
          _note?: string
          _role: Database["public"]["Enums"]["app_role"]
          _valid_days?: number
        }
        Returns: string
      }
      display_names: {
        Args: { _ids: string[] }
        Returns: {
          full_name: string
          id: string
        }[]
      }
      display_roles: {
        Args: { _ids: string[] }
        Returns: {
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      grant_consent: {
        Args: {
          _kind: Database["public"]["Enums"]["consent_kind"]
          _text_version: string
        }
        Returns: string
      }
      has_my_consent: {
        Args: { _kind: Database["public"]["Enums"]["consent_kind"] }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_deputy: {
        Args: { _deputy: string; _on_date?: string; _principal: string }
        Returns: boolean
      }
      is_leitung: { Args: { _user_id: string }; Returns: boolean }
      is_reviewer_role: { Args: { _user_id: string }; Returns: boolean }
      list_possible_deputies: {
        Args: never
        Returns: {
          full_name: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      log_ai_assist: {
        Args: { _field: string; _report_id: string }
        Returns: undefined
      }
      missing_weeks: {
        Args: { p_azubi?: string }
        Returns: {
          azubi_id: string
          days_missing: number
          days_overdue: number
          week_end: string
          week_start: string
        }[]
      }
      notification_recipients: {
        Args: { _azubi: string }
        Returns: {
          deputy_for: string
          user_id: string
        }[]
      }
      redeem_invite_code: {
        Args: { _code: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      reject_report: {
        Args: { _expected_version: number; _note: string; _report_id: string }
        Returns: undefined
      }
      reopen_report: {
        Args: { _reason: string; _report_id: string }
        Returns: undefined
      }
      report_canonical: { Args: { _report_id: string }; Returns: string }
      report_hash: { Args: { _report_id: string }; Returns: string }
      report_title: { Args: { _report_id: string }; Returns: string }
      review_absence: {
        Args: {
          _absence_id: string
          _decision: Database["public"]["Enums"]["absence_status"]
          _note?: string
        }
        Returns: undefined
      }
      review_queue: {
        Args: { _statuses?: Database["public"]["Enums"]["report_status"][] }
        Returns: {
          azubi_id: string
          deputy_for: string
          report_id: string
          status: Database["public"]["Enums"]["report_status"]
          submitted_at: string
        }[]
      }
      revoke_consent: {
        Args: { _kind: Database["public"]["Enums"]["consent_kind"] }
        Returns: undefined
      }
      revoke_deputy: { Args: { _id: string }; Returns: undefined }
      revoke_invite_code: { Args: { _code: string }; Returns: undefined }
      send_report_reminder: {
        Args: { azubi_id: string; message: string; period_label: string }
        Returns: string
      }
      set_deputy: {
        Args: {
          _date_from: string
          _date_to: string
          _deputy: string
          _note?: string
          _principal: string
          _reason: string
        }
        Returns: string
      }
      set_my_profession: {
        Args: { _profession_id: string }
        Returns: undefined
      }
      submit_report: {
        Args: {
          _client_signed_at?: string
          _expected_version: number
          _image_path?: string
          _method: string
          _report_id: string
        }
        Returns: undefined
      }
      team_week_overview: {
        Args: { week_start: string }
        Returns: {
          approved_total: number
          azubi_id: string
          can_review: boolean
          to_review: number
          week_status: string
        }[]
      }
      write_audit: {
        Args: {
          _action: string
          _azubi_id?: string
          _details?: Json
          _entity_id: string
          _entity_type: string
        }
        Returns: number
      }
    }
    Enums: {
      absence_status: "pending" | "approved" | "rejected"
      absence_type: "urlaub" | "krank" | "berufsschule" | "sonstiges"
      app_role:
        | "azubi"
        | "ausbilder"
        | "betriebsleiter"
        | "ausbildungsberater"
        | "lehrer"
        | "ausbildungsleitung"
      consent_kind: "dictation" | "ai_text"
      grade_kind: "klausur" | "muendlich" | "test" | "sonstige"
      report_status: "draft" | "submitted" | "approved" | "rejected"
      report_type: "daily" | "weekly"
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
      absence_status: ["pending", "approved", "rejected"],
      absence_type: ["urlaub", "krank", "berufsschule", "sonstiges"],
      app_role: [
        "azubi",
        "ausbilder",
        "betriebsleiter",
        "ausbildungsberater",
        "lehrer",
        "ausbildungsleitung",
      ],
      consent_kind: ["dictation", "ai_text"],
      grade_kind: ["klausur", "muendlich", "test", "sonstige"],
      report_status: ["draft", "submitted", "approved", "rejected"],
      report_type: ["daily", "weekly"],
    },
  },
} as const
